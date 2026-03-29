#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use crate::utils::transfer_checked;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer as SolTransfer};
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::token_interface::{Mint as InterfaceMint, TokenInterface};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ParimutuelWithdrawArgs {
    pub market_id: u64,
    pub outcome_index: u8,
    pub amount: u64,
}

pub fn handler(ctx: Context<ParimutuelWithdraw>, args: ParimutuelWithdrawArgs) -> Result<()> {
    let clock = Clock::get()?;
    let market = &ctx.accounts.market;
    require!(
        market.market_type == MarketType::Parimutuel,
        PredictionMarketError::WrongMarketType
    );
    require!(!market.is_resolved(), PredictionMarketError::MarketAlreadyResolved);
    require!(!market.voided, PredictionMarketError::MarketVoided);
    require!(!market.is_closed(&clock), PredictionMarketError::MarketClosed);
    require!(args.amount > 0, PredictionMarketError::ZeroMintAmount);
    require!(
        (args.outcome_index as usize) < market.outcome_count as usize,
        PredictionMarketError::InvalidOutcomeIndex
    );

    let pos = &mut ctx.accounts.position;
    require!(pos.market == market.key(), PredictionMarketError::ParimutuelNotInitialized);
    require!(pos.user == ctx.accounts.user.key(), PredictionMarketError::ParimutuelNotInitialized);
    require!(pos.outcome_index == args.outcome_index, PredictionMarketError::InvalidOutcomeIndex);
    require!(
        pos.active_stake >= args.amount,
        PredictionMarketError::ParimutuelInsufficientStake
    );
    require!(!pos.claimed, PredictionMarketError::ParimutuelAlreadyClaimed);

    let pari = &mut ctx.accounts.parimutuel_state;
    require!(pari.market == market.key(), PredictionMarketError::ParimutuelNotInitialized);

    let i = args.outcome_index as usize;
    let penalty = (args.amount as u128)
        .checked_mul(pari.early_withdraw_penalty_bps as u128)
        .and_then(|x| x.checked_div(10000))
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)? as u64;
    let refund = args
        .amount
        .checked_sub(penalty)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;
    let pool_keep = (penalty as u128)
        .checked_mul(pari.penalty_kept_in_pool_bps as u128)
        .and_then(|x| x.checked_div(10000))
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)? as u64;
    let penalty_surplus = penalty
        .checked_sub(pool_keep)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;
    let protocol_cut = (penalty_surplus as u128)
        .checked_mul(pari.penalty_surplus_protocol_share_bps as u128)
        .and_then(|x| x.checked_div(10000))
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)? as u64;
    let creator_cut = penalty_surplus
        .checked_sub(protocol_cut)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;

    // Split `pool_keep` (penalty slice that used to linger in the outcome pool) like penalty surplus.
    let pool_keep_protocol = (pool_keep as u128)
        .checked_mul(pari.penalty_surplus_protocol_share_bps as u128)
        .and_then(|x| x.checked_div(10000))
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)? as u64;
    let pool_keep_creator = pool_keep
        .checked_sub(pool_keep_protocol)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;
    let total_protocol_penalty = protocol_cut
        .checked_add(pool_keep_protocol)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;
    let total_creator_penalty = creator_cut
        .checked_add(pool_keep_creator)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;

    let global_config = &ctx.accounts.global_config;
    let withdraw_pf_raw = (args.amount as u128)
        .checked_mul(global_config.parimutuel_withdraw_platform_fee_bps as u128)
        .and_then(|x| x.checked_div(10000))
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)? as u64;
    let withdraw_pf = withdraw_pf_raw.min(refund);
    let user_refund = refund
        .checked_sub(withdraw_pf)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;

    let fee_lamports = global_config.platform_fee_lamports;
    if fee_lamports > 0 {
        require!(
            ctx.accounts.platform_treasury_wallet.key() == global_config.platform_treasury,
            PredictionMarketError::ConfigUnauthorized
        );
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                SolTransfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.platform_treasury_wallet.to_account_info(),
                },
            ),
            fee_lamports,
        )?;
    }

    // Full withdrawal from this outcome's bucket so `outcome_pools[i]` stays aligned with
    // the sum of `active_stake` on side `i`. `pool_keep` is paid to protocol/creator instead
    // of remaining as unattributed liquidity (would skew claim math).
    pari.outcome_pools[i] = pari.outcome_pools[i]
        .checked_sub(args.amount)
        .ok_or(PredictionMarketError::OutcomeTallyEmpty)?;
    pari.total_pool = pari
        .total_pool
        .checked_sub(refund)
        .and_then(|x| x.checked_sub(total_protocol_penalty))
        .and_then(|x| x.checked_sub(total_creator_penalty))
        .ok_or(PredictionMarketError::OutcomeTallyEmpty)?;

    pos.active_stake = pos
        .active_stake
        .checked_sub(args.amount)
        .ok_or(PredictionMarketError::ParimutuelInsufficientStake)?;
    pos.total_withdrawn = pos
        .total_withdrawn
        .checked_add(args.amount)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;

    let decimals = ctx.accounts.collateral_mint.decimals;
    let market_id_bytes = args.market_id.to_le_bytes();
    let market_seeds: &[&[u8]] = &[
        b"market",
        market.creator.as_ref(),
        market_id_bytes.as_ref(),
        &[market.bump],
    ];

    if user_refund > 0 {
        transfer_checked(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.user_collateral_account.to_account_info(),
            &ctx.accounts.collateral_mint,
            &ctx.accounts.market.to_account_info(),
            &ctx.accounts.collateral_token_program,
            user_refund,
            decimals,
            &[market_seeds],
        )?;
    }
    if withdraw_pf > 0 {
        require!(
            ctx.accounts.platform_treasury_wallet.key() == ctx.accounts.global_config.platform_treasury,
            PredictionMarketError::ConfigUnauthorized
        );
        require!(
            ctx.accounts.platform_treasury_ata.mint == ctx.accounts.collateral_mint.key(),
            PredictionMarketError::InvalidTreasuryAta
        );
        require!(
            ctx.accounts.platform_treasury_ata.owner == ctx.accounts.platform_treasury_wallet.key(),
            PredictionMarketError::InvalidTreasuryAta
        );
        transfer_checked(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.platform_treasury_ata.to_account_info(),
            &ctx.accounts.collateral_mint,
            &ctx.accounts.market.to_account_info(),
            &ctx.accounts.collateral_token_program,
            withdraw_pf,
            decimals,
            &[market_seeds],
        )?;
    }
    if total_protocol_penalty > 0 {
        require!(
            ctx.accounts.platform_treasury_wallet.key() == ctx.accounts.global_config.platform_treasury,
            PredictionMarketError::ConfigUnauthorized
        );
        require!(
            ctx.accounts.platform_treasury_ata.mint == ctx.accounts.collateral_mint.key(),
            PredictionMarketError::InvalidTreasuryAta
        );
        require!(
            ctx.accounts.platform_treasury_ata.owner == ctx.accounts.platform_treasury_wallet.key(),
            PredictionMarketError::InvalidTreasuryAta
        );
        transfer_checked(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.platform_treasury_ata.to_account_info(),
            &ctx.accounts.collateral_mint,
            &ctx.accounts.market.to_account_info(),
            &ctx.accounts.collateral_token_program,
            total_protocol_penalty,
            decimals,
            &[market_seeds],
        )?;
    }
    if total_creator_penalty > 0 {
        transfer_checked(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.creator_fee_account.to_account_info(),
            &ctx.accounts.collateral_mint,
            &ctx.accounts.market.to_account_info(),
            &ctx.accounts.collateral_token_program,
            total_creator_penalty,
            decimals,
            &[market_seeds],
        )?;
    }

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: ParimutuelWithdrawArgs)]
pub struct ParimutuelWithdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(mut, address = market.creator_fee_account)]
    pub creator_fee_account: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    #[account(
        mut,
        seeds = [b"pari", market.key().as_ref()],
        bump = parimutuel_state.bump,
    )]
    pub parimutuel_state: Account<'info, ParimutuelState>,

    #[account(
        mut,
        seeds = [
            b"pari-pos",
            market.key().as_ref(),
            user.key().as_ref(),
            &[args.outcome_index],
        ],
        bump = position.bump,
    )]
    pub position: Account<'info, ParimutuelPosition>,

    #[account(
        mut,
        seeds = [market.key().as_ref(), b"vault"],
        bump,
        constraint = vault.key() == market.vault,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub collateral_mint: InterfaceAccount<'info, InterfaceMint>,

    #[account(
        mut,
        constraint = user_collateral_account.owner == user.key(),
        constraint = user_collateral_account.mint == collateral_mint.key(),
    )]
    pub user_collateral_account: Account<'info, TokenAccount>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut, address = global_config.platform_treasury)]
    pub platform_treasury_wallet: SystemAccount<'info>,

    #[account(mut)]
    pub platform_treasury_ata: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[cfg(test)]
mod penalty_tests {
    #[test]
    fn withdrawal_penalty_partitions_then_splits_pool_keep_and_surplus_to_fees() {
        let amount = 100u64;
        let early_withdraw_penalty_bps = 500u16;
        let penalty_kept_in_pool_bps = 8000u16;
        let protocol_share_bps = 2000u16;
        let penalty = (amount as u128 * early_withdraw_penalty_bps as u128 / 10000) as u64;
        assert_eq!(penalty, 5);
        let refund = amount - penalty;
        assert_eq!(refund, 95);
        let pool_keep = (penalty as u128 * penalty_kept_in_pool_bps as u128 / 10000) as u64;
        assert_eq!(pool_keep, 4);
        let penalty_surplus = penalty - pool_keep;
        assert_eq!(penalty_surplus, 1);
        let protocol_cut =
            (penalty_surplus as u128 * protocol_share_bps as u128 / 10000) as u64;
        let pool_keep_protocol =
            (pool_keep as u128 * protocol_share_bps as u128 / 10000) as u64;
        let total_protocol = protocol_cut + pool_keep_protocol;
        let total_creator = penalty - total_protocol;
        assert_eq!(total_protocol + total_creator, penalty);
        assert_eq!(refund + penalty, amount);
    }
}
