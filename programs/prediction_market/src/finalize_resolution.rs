#![allow(clippy::result_large_err)]

use crate::state::*;
use anchor_lang::prelude::*;

/// Check M-of-N using per-outcome tally PDAs and mark the market resolved when threshold is met.
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

    let tallies: [Option<&Account<OutcomeTally>>; 8] = [
        ctx.accounts.outcome_tally_0.as_ref(),
        ctx.accounts.outcome_tally_1.as_ref(),
        ctx.accounts.outcome_tally_2.as_ref(),
        ctx.accounts.outcome_tally_3.as_ref(),
        ctx.accounts.outcome_tally_4.as_ref(),
        ctx.accounts.outcome_tally_5.as_ref(),
        ctx.accounts.outcome_tally_6.as_ref(),
        ctx.accounts.outcome_tally_7.as_ref(),
    ];
    let outcome_count = market.outcome_count as usize;
    let threshold = market.resolution_threshold as usize;

    for outcome_index in 0..outcome_count {
        let count = tallies[outcome_index]
            .map(|t| t.count as u32)
            .unwrap_or(0);
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

    #[account(seeds = [market.key().as_ref(), b"outcome-tally", &[0]], bump)]
    pub outcome_tally_0: Option<Account<'info, OutcomeTally>>,
    #[account(seeds = [market.key().as_ref(), b"outcome-tally", &[1]], bump)]
    pub outcome_tally_1: Option<Account<'info, OutcomeTally>>,
    #[account(seeds = [market.key().as_ref(), b"outcome-tally", &[2]], bump)]
    pub outcome_tally_2: Option<Account<'info, OutcomeTally>>,
    #[account(seeds = [market.key().as_ref(), b"outcome-tally", &[3]], bump)]
    pub outcome_tally_3: Option<Account<'info, OutcomeTally>>,
    #[account(seeds = [market.key().as_ref(), b"outcome-tally", &[4]], bump)]
    pub outcome_tally_4: Option<Account<'info, OutcomeTally>>,
    #[account(seeds = [market.key().as_ref(), b"outcome-tally", &[5]], bump)]
    pub outcome_tally_5: Option<Account<'info, OutcomeTally>>,
    #[account(seeds = [market.key().as_ref(), b"outcome-tally", &[6]], bump)]
    pub outcome_tally_6: Option<Account<'info, OutcomeTally>>,
    #[account(seeds = [market.key().as_ref(), b"outcome-tally", &[7]], bump)]
    pub outcome_tally_7: Option<Account<'info, OutcomeTally>>,
}
