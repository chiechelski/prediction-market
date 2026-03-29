#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

/// A resolver casts a vote for an outcome. Requires `has_voted == false` on the vote PDA
/// (first vote or after `revoke_resolution_vote`). Increments the per-outcome tally PDA.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct VoteResolutionArgs {
    pub market_id: u64,
    pub outcome_index: u8,
    /// Resolver slot index; must match `resolver` and be `< market.num_resolvers`.
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
    require!(
        args.resolver_index < market.num_resolvers,
        PredictionMarketError::InvalidResolutionThreshold
    );

    let signer = ctx.accounts.resolver_signer.key();
    require!(
        ctx.accounts.resolver.resolver_pubkey == signer,
        PredictionMarketError::NotResolver
    );

    let vote = &mut *ctx.accounts.resolution_vote;
    require!(!vote.has_voted, PredictionMarketError::AlreadyVoted);

    let tally = &mut *ctx.accounts.outcome_tally;
    tally.count = tally
        .count
        .checked_add(1)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;
    tally._padding = [0u8; OUTCOME_TALLY_ACCOUNT_SPACE_PADDING];

    vote.has_voted = true;
    vote.outcome_index = args.outcome_index;
    vote._padding = [0u8; RESOLUTION_VOTE_ACCOUNT_SPACE_PADDING];
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

    #[account(
        seeds = [market.key().as_ref(), b"resolver", &[args.resolver_index]],
        bump,
    )]
    pub resolver: Box<Account<'info, Resolver>>,

    #[account(
        init_if_needed,
        payer = resolver_signer,
        space = ResolutionVote::LEN,
        seeds = [market.key().as_ref(), b"vote", &[args.resolver_index]],
        bump,
    )]
    pub resolution_vote: Box<Account<'info, ResolutionVote>>,

    #[account(
        init_if_needed,
        payer = resolver_signer,
        space = OutcomeTally::LEN,
        seeds = [market.key().as_ref(), b"outcome-tally", &[args.outcome_index]],
        bump,
    )]
    pub outcome_tally: Box<Account<'info, OutcomeTally>>,

    pub system_program: Program<'info, System>,
}
