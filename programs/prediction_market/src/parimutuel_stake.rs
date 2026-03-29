#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use crate::utils::transfer_checked;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer as SolTransfer};
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::token_interface::{Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount, TokenInterface};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ParimutuelStakeArgs {
    pub market_id: u64,
    pub outcome_index: u8,
    /// Collateral base units **credited to the pari pool** (net stake). Platform and creator token fees
    /// are `floor(amount * bps / 10000)` each and debited **in addition** to this amount.
    pub amount: u64,
}

pub fn handler(ctx: Context<ParimutuelStake>, args: ParimutuelStakeArgs) -> Result<()> {
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

    require!(
        ctx.accounts.platform_treasury_wallet.key() == ctx.accounts.global_config.platform_treasury,
        PredictionMarketError::ConfigUnauthorized
    );
    require!(
        ctx.accounts.platform_treasury_wallet.to_account_info().owner == &anchor_lang::solana_program::system_program::ID,
        PredictionMarketError::ConfigUnauthorized
    );
    let treasury_ata = &ctx.accounts.platform_treasury_ata;
    require!(
        treasury_ata.mint == ctx.accounts.collateral_mint.key(),
        PredictionMarketError::InvalidTreasuryAta
    );
    require!(
        treasury_ata.owner == ctx.accounts.platform_treasury_wallet.key(),
        PredictionMarketError::InvalidTreasuryAta
    );
    require!(
        treasury_ata.to_account_info().owner == &ctx.accounts.collateral_token_program.key(),
        PredictionMarketError::InvalidTreasuryAta
    );

    let global_config = &ctx.accounts.global_config;
    let global_bps = global_config.deposit_platform_fee_bps;
    let net = args.amount;
    let platform_fee = market.calculate_deposit_platform_fee(net, global_bps);
    let creator_fee = market.calculate_creator_fee(net);
    let gross = net
        .checked_add(platform_fee)
        .and_then(|g| g.checked_add(creator_fee))
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;

    let fee_lamports = global_config.platform_fee_lamports;
    if fee_lamports > 0 {
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

    let pari = &mut ctx.accounts.parimutuel_state;
    require!(pari.market == market.key(), PredictionMarketError::ParimutuelNotInitialized);

    let i = args.outcome_index as usize;
    pari.outcome_pools[i] = pari.outcome_pools[i]
        .checked_add(net)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;
    pari.total_pool = pari
        .total_pool
        .checked_add(net)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;

    let pos = &mut ctx.accounts.position;
    if pos.market == Pubkey::default() {
        pos.market = market.key();
        pos.user = ctx.accounts.user.key();
        pos.outcome_index = args.outcome_index;
        pos.bump = ctx.bumps.position;
        pos._padding = [0u8; PARIMUTUEL_POSITION_ACCOUNT_SPACE_PADDING];
    }
    require!(pos.market == market.key(), PredictionMarketError::ParimutuelNotInitialized);
    require!(pos.user == ctx.accounts.user.key(), PredictionMarketError::ParimutuelNotInitialized);
    require!(pos.outcome_index == args.outcome_index, PredictionMarketError::InvalidOutcomeIndex);
    require!(!pos.claimed, PredictionMarketError::ParimutuelAlreadyClaimed);

    pos.active_stake = pos
        .active_stake
        .checked_add(net)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;
    pos.total_deposited = pos
        .total_deposited
        .checked_add(gross)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;

    let decimals = ctx.accounts.collateral_mint.decimals;
    let from = ctx.accounts.user_collateral_account.to_account_info();
    let authority = ctx.accounts.user.to_account_info();

    transfer_checked(
        &from,
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.collateral_mint,
        &authority,
        &ctx.accounts.collateral_token_program,
        net,
        decimals,
        &[],
    )?;
    if platform_fee > 0 {
        transfer_checked(
            &from,
            &ctx.accounts.platform_treasury_ata.to_account_info(),
            &ctx.accounts.collateral_mint,
            &authority,
            &ctx.accounts.collateral_token_program,
            platform_fee,
            decimals,
            &[],
        )?;
    }
    if creator_fee > 0 {
        transfer_checked(
            &from,
            &ctx.accounts.creator_fee_account.to_account_info(),
            &ctx.accounts.collateral_mint,
            &authority,
            &ctx.accounts.collateral_token_program,
            creator_fee,
            decimals,
            &[],
        )?;
    }

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: ParimutuelStakeArgs)]
pub struct ParimutuelStake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [b"pari", market.key().as_ref()],
        bump = parimutuel_state.bump,
    )]
    pub parimutuel_state: Box<Account<'info, ParimutuelState>>,

    #[account(
        init_if_needed,
        payer = user,
        space = ParimutuelPosition::LEN,
        seeds = [
            b"pari-pos",
            market.key().as_ref(),
            user.key().as_ref(),
            &[args.outcome_index],
        ],
        bump,
    )]
    pub position: Box<Account<'info, ParimutuelPosition>>,

    #[account(
        mut,
        seeds = [market.key().as_ref(), b"vault"],
        bump,
        constraint = vault.key() == market.vault,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    pub collateral_mint: InterfaceAccount<'info, InterfaceMint>,

    #[account(
        mut,
        constraint = user_collateral_account.owner == user.key(),
        constraint = user_collateral_account.mint == collateral_mint.key(),
    )]
    pub user_collateral_account: Box<Account<'info, TokenAccount>>,

    #[account(mut, address = market.creator_fee_account)]
    pub creator_fee_account: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    #[account(mut, address = global_config.platform_treasury)]
    pub platform_treasury_wallet: SystemAccount<'info>,

    #[account(mut)]
    pub platform_treasury_ata: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    #[account(seeds = [b"allowed-mint", collateral_mint.key().as_ref()], bump)]
    pub allowed_mint: Account<'info, AllowedMint>,

    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
