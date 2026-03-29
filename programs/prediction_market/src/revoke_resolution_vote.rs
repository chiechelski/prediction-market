#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

/// Clears a resolver's active vote (1 → 0): decrements the tally for `outcome_index` and
/// sets `has_voted` false. `outcome_index` must match the stored vote.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RevokeResolutionVoteArgs {
    pub market_id: u64,
    pub resolver_index: u8,
    /// Must equal the current `resolution_vote.outcome_index` while `has_voted` is true.
    pub outcome_index: u8,
}

pub fn handler(ctx: Context<RevokeResolutionVote>, args: RevokeResolutionVoteArgs) -> Result<()> {
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
    require!(vote.has_voted, PredictionMarketError::NotVoted);
    require!(
        vote.outcome_index == args.outcome_index,
        PredictionMarketError::InvalidOutcomeIndex
    );

    let tally = &mut *ctx.accounts.outcome_tally;
    require!(tally.count > 0, PredictionMarketError::OutcomeTallyEmpty);
    tally.count -= 1;
    tally._padding = [0u8; OUTCOME_TALLY_ACCOUNT_SPACE_PADDING];

    vote.has_voted = false;
    vote.outcome_index = 0;
    vote._padding = [0u8; RESOLUTION_VOTE_ACCOUNT_SPACE_PADDING];
    Ok(())
}

#[derive(Accounts)]
#[instruction(args: RevokeResolutionVoteArgs)]
pub struct RevokeResolutionVote<'info> {
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
        mut,
        seeds = [market.key().as_ref(), b"vote", &[args.resolver_index]],
        bump,
    )]
    pub resolution_vote: Box<Account<'info, ResolutionVote>>,

    #[account(
        mut,
        seeds = [market.key().as_ref(), b"outcome-tally", &[args.outcome_index]],
        bump,
    )]
    pub outcome_tally: Box<Account<'info, OutcomeTally>>,
}
