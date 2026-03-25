#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

/// A resolver submits their vote for an outcome. Call finalize_resolution to apply M-of-N and mark resolved.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct VoteResolutionArgs {
    pub market_id: u64,
    pub outcome_index: u8,
    /// Resolver slot index (0..7) for this signer; must match the resolver account at this index.
    pub resolver_index: u8,
}

pub fn handler(ctx: Context<VoteResolution>, args: VoteResolutionArgs) -> Result<()> {
    let market = &ctx.accounts.market;
    require!(!market.is_resolved(), PredictionMarketError::MarketAlreadyResolved);
    require!(!market.voided, PredictionMarketError::MarketVoided);
    require!(
        args.outcome_index < market.outcome_count,
        PredictionMarketError::InvalidOutcomeIndex
    );
    require!(args.resolver_index < 8, PredictionMarketError::InvalidOutcomeIndex);

    let signer = ctx.accounts.resolver_signer.key();
    let resolvers = [
        &ctx.accounts.resolver_0,
        &ctx.accounts.resolver_1,
        &ctx.accounts.resolver_2,
        &ctx.accounts.resolver_3,
        &ctx.accounts.resolver_4,
        &ctx.accounts.resolver_5,
        &ctx.accounts.resolver_6,
        &ctx.accounts.resolver_7,
    ];
    require!(
        resolvers[args.resolver_index as usize].resolver_pubkey == signer,
        PredictionMarketError::NotResolver
    );

    let vote = &mut ctx.accounts.resolution_vote;
    vote.outcome_index = args.outcome_index;
    Ok(())
}

#[derive(Accounts)]
#[instruction(args: VoteResolutionArgs)]
pub struct VoteResolution<'info> {
    #[account(mut)]
    pub resolver_signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(seeds = [market.key().as_ref(), b"resolver", &[0]], bump)]
    pub resolver_0: Account<'info, Resolver>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[1]], bump)]
    pub resolver_1: Account<'info, Resolver>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[2]], bump)]
    pub resolver_2: Account<'info, Resolver>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[3]], bump)]
    pub resolver_3: Account<'info, Resolver>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[4]], bump)]
    pub resolver_4: Account<'info, Resolver>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[5]], bump)]
    pub resolver_5: Account<'info, Resolver>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[6]], bump)]
    pub resolver_6: Account<'info, Resolver>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[7]], bump)]
    pub resolver_7: Account<'info, Resolver>,

    #[account(
        init,
        payer = resolver_signer,
        space = ResolutionVote::LEN,
        seeds = [market.key().as_ref(), b"vote", &[args.resolver_index]],
        bump,
    )]
    pub resolution_vote: Account<'info, ResolutionVote>,

    pub system_program: Program<'info, System>,
}
