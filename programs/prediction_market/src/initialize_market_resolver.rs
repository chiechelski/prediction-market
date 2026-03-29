#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

/// Initializes **one** resolver PDA at `resolver_index` (0..`market.num_resolvers`).
/// Call once per slot; bundle multiple instructions in one transaction to save round-trips
/// (including `initialize_parimutuel_state` for pari-mutuel markets — no ordering constraint).
/// Only `market.creator` may sign as payer.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeMarketResolverArgs {
    pub market_id: u64,
    pub resolver_index: u8,
    pub resolver_pubkey: Pubkey,
}

pub fn handler(
    ctx: Context<InitializeMarketResolver>,
    args: InitializeMarketResolverArgs,
) -> Result<()> {
    require!(
        ctx.accounts.payer.key() == ctx.accounts.market.creator,
        PredictionMarketError::OnlyMarketCreator
    );
    let market = &ctx.accounts.market;
    require!(
        args.resolver_index < market.num_resolvers,
        PredictionMarketError::InvalidResolutionThreshold
    );
    require!(
        args.resolver_pubkey != Pubkey::default(),
        PredictionMarketError::InvalidOutcomeIndex
    );

    let r = &mut ctx.accounts.resolver;
    r.resolver_pubkey = args.resolver_pubkey;
    r._padding = [0u8; RESOLVER_ACCOUNT_SPACE_PADDING];
    Ok(())
}

#[derive(Accounts)]
#[instruction(args: InitializeMarketResolverArgs)]
pub struct InitializeMarketResolver<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,

    #[account(
        init,
        payer = payer,
        space = Resolver::LEN,
        seeds = [market.key().as_ref(), b"resolver", &[args.resolver_index]],
        bump,
    )]
    pub resolver: Account<'info, Resolver>,
}
