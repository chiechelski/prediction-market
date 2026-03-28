#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

/// Second step for pari-mutuel markets: creates [`ParimutuelState`] (pools + penalty params).
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParimutuelStateArgs {
    pub market_id: u64,
    /// Basis points of the withdrawn amount withheld as penalty.
    pub early_withdraw_penalty_bps: u16,
    /// Of the withheld penalty, bps that stay in the outcome pool; surplus is split protocol/creator.
    pub penalty_kept_in_pool_bps: u16,
    /// Share of penalty surplus to creator — must sum with
    /// `global_config.parimutuel_penalty_protocol_share_bps` to 10000.
    pub penalty_surplus_creator_share_bps: u16,
}

pub fn handler(ctx: Context<InitializeParimutuelState>, args: InitializeParimutuelStateArgs) -> Result<()> {
    require!(
        ctx.accounts.market.market_type == MarketType::Parimutuel,
        PredictionMarketError::WrongMarketType
    );
    require!(
        args.early_withdraw_penalty_bps <= 10000,
        PredictionMarketError::InvalidParimutuelPenalty
    );
    require!(
        args.penalty_kept_in_pool_bps <= 10000,
        PredictionMarketError::InvalidParimutuelPenalty
    );
    let protocol = ctx
        .accounts
        .global_config
        .parimutuel_penalty_protocol_share_bps;
    let creator = args.penalty_surplus_creator_share_bps;
    require!(
        protocol.checked_add(creator) == Some(10000),
        PredictionMarketError::InvalidParimutuelPenalty
    );

    let pari = &mut ctx.accounts.parimutuel_state;
    pari.market = ctx.accounts.market.key();
    pari.total_pool = 0;
    pari.outcome_pools = [0u64; 8];
    pari.early_withdraw_penalty_bps = args.early_withdraw_penalty_bps;
    pari.penalty_kept_in_pool_bps = args.penalty_kept_in_pool_bps;
    pari.penalty_surplus_protocol_share_bps = protocol;
    pari.penalty_surplus_creator_share_bps = creator;
    pari.bump = ctx.bumps.parimutuel_state;
    pari.resolved_total_pool = None;
    pari.resolved_winning_outcome_pool = None;
    pari._padding = [0u8; PARIMUTUEL_STATE_ACCOUNT_SPACE_PADDING];

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: InitializeParimutuelStateArgs)]
pub struct InitializeParimutuelState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = payer,
        space = ParimutuelState::LEN,
        seeds = [b"pari", market.key().as_ref()],
        bump,
    )]
    pub parimutuel_state: Account<'info, ParimutuelState>,

    pub system_program: Program<'info, System>,
}
