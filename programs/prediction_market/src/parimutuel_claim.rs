#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use crate::utils::transfer_checked;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::token_interface::{Mint as InterfaceMint, TokenInterface};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ParimutuelClaimArgs {
    pub market_id: u64,
    /// Must equal the resolved winning outcome index.
    pub outcome_index: u8,
}

pub fn handler(ctx: Context<ParimutuelClaim>, args: ParimutuelClaimArgs) -> Result<()> {
    let market = &ctx.accounts.market;
    require!(
        market.market_type == MarketType::Parimutuel,
        PredictionMarketError::WrongMarketType
    );
    require!(market.is_resolved(), PredictionMarketError::MarketNotResolved);
    require!(!market.voided, PredictionMarketError::MarketVoided);

    let w = market
        .resolved_outcome_index
        .ok_or(PredictionMarketError::MarketNotResolved)? as usize;
    require!(
        args.outcome_index as usize == w,
        PredictionMarketError::InvalidOutcomeIndex
    );

    let pari = &mut ctx.accounts.parimutuel_state;
    require!(pari.market == market.key(), PredictionMarketError::ParimutuelNotInitialized);

    if pari.resolved_total_pool.is_none() {
        let win_pool = pari.outcome_pools[w];
        require!(
            win_pool > 0,
            PredictionMarketError::ParimutuelEmptyWinningPool
        );
        pari.resolved_total_pool = Some(pari.total_pool);
        pari.resolved_winning_outcome_pool = Some(win_pool);
    }

    let t = pari.resolved_total_pool.unwrap();
    let win_denom = pari.resolved_winning_outcome_pool.unwrap();

    let pos = &mut ctx.accounts.position;
    require!(pos.market == market.key(), PredictionMarketError::ParimutuelNotInitialized);
    require!(pos.user == ctx.accounts.user.key(), PredictionMarketError::ParimutuelNotInitialized);
    require!(pos.outcome_index == args.outcome_index, PredictionMarketError::InvalidOutcomeIndex);
    require!(!pos.claimed, PredictionMarketError::ParimutuelAlreadyClaimed);
    require!(pos.active_stake > 0, PredictionMarketError::ParimutuelInsufficientStake);

    let payout = (pos.active_stake as u128)
        .checked_mul(t as u128)
        .and_then(|x| x.checked_div(win_denom as u128))
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)? as u64;

    require!(payout > 0, PredictionMarketError::ParimutuelEmptyWinningPool);

    pos.claimed = true;
    pos.active_stake = 0;

    let decimals = ctx.accounts.collateral_mint.decimals;
    let market_id_bytes = args.market_id.to_le_bytes();
    let market_seeds: &[&[u8]] = &[
        b"market",
        market.creator.as_ref(),
        market_id_bytes.as_ref(),
        &[market.bump],
    ];

    transfer_checked(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.user_collateral_account.to_account_info(),
        &ctx.accounts.collateral_mint,
        &ctx.accounts.market.to_account_info(),
        &ctx.accounts.collateral_token_program,
        payout,
        decimals,
        &[market_seeds],
    )?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: ParimutuelClaimArgs)]
pub struct ParimutuelClaim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

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

    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token>,
}
