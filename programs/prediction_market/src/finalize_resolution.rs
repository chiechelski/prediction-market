#![allow(clippy::result_large_err)]

use crate::state::*;
use anchor_lang::prelude::*;

/// Check M-of-N resolution votes and mark market resolved when threshold is met.
/// Anyone can call. No-op if already resolved or threshold not met.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct FinalizeResolutionArgs {
    pub market_id: u64,
}

pub fn handler(ctx: Context<FinalizeResolution>, _args: FinalizeResolutionArgs) -> Result<()> {
    let market = &mut ctx.accounts.market;
    if market.is_resolved() {
        return Ok(());
    }

    let votes: [Option<&Account<ResolutionVote>>; 8] = [
        ctx.accounts.resolution_vote_0.as_ref(),
        ctx.accounts.resolution_vote_1.as_ref(),
        ctx.accounts.resolution_vote_2.as_ref(),
        ctx.accounts.resolution_vote_3.as_ref(),
        ctx.accounts.resolution_vote_4.as_ref(),
        ctx.accounts.resolution_vote_5.as_ref(),
        ctx.accounts.resolution_vote_6.as_ref(),
        ctx.accounts.resolution_vote_7.as_ref(),
    ];
    let outcome_count = market.outcome_count as usize;
    let threshold = market.resolution_threshold as usize;

    for outcome_index in 0..outcome_count {
        let mut count = 0u32;
        for vote_opt in &votes {
            if let Some(vote) = vote_opt {
                if vote.outcome_index == outcome_index as u8 {
                    count += 1;
                }
            }
        }
        if count >= threshold as u32 {
            market.resolved_outcome_index = Some(outcome_index as u8);
            return Ok(());
        }
    }
    Ok(())
}

#[derive(Accounts)]
#[instruction(args: FinalizeResolutionArgs)]
pub struct FinalizeResolution<'info> {
    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(seeds = [market.key().as_ref(), b"vote", &[0]], bump)]
    pub resolution_vote_0: Option<Account<'info, ResolutionVote>>,
    #[account(seeds = [market.key().as_ref(), b"vote", &[1]], bump)]
    pub resolution_vote_1: Option<Account<'info, ResolutionVote>>,
    #[account(seeds = [market.key().as_ref(), b"vote", &[2]], bump)]
    pub resolution_vote_2: Option<Account<'info, ResolutionVote>>,
    #[account(seeds = [market.key().as_ref(), b"vote", &[3]], bump)]
    pub resolution_vote_3: Option<Account<'info, ResolutionVote>>,
    #[account(seeds = [market.key().as_ref(), b"vote", &[4]], bump)]
    pub resolution_vote_4: Option<Account<'info, ResolutionVote>>,
    #[account(seeds = [market.key().as_ref(), b"vote", &[5]], bump)]
    pub resolution_vote_5: Option<Account<'info, ResolutionVote>>,
    #[account(seeds = [market.key().as_ref(), b"vote", &[6]], bump)]
    pub resolution_vote_6: Option<Account<'info, ResolutionVote>>,
    #[account(seeds = [market.key().as_ref(), b"vote", &[7]], bump)]
    pub resolution_vote_7: Option<Account<'info, ResolutionVote>>,
}
