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

    #[account(seeds = [market.key().as_ref(), b"resolver", &[0]], bump)]
    pub resolver_0: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[1]], bump)]
    pub resolver_1: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[2]], bump)]
    pub resolver_2: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[3]], bump)]
    pub resolver_3: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[4]], bump)]
    pub resolver_4: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[5]], bump)]
    pub resolver_5: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[6]], bump)]
    pub resolver_6: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[7]], bump)]
    pub resolver_7: Box<Account<'info, Resolver>>,

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
