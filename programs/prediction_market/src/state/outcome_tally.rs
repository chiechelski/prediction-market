#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const OUTCOME_TALLY_ACCOUNT_SPACE_PADDING: usize = 64;

/// Per-outcome vote counter for resolution (M-of-N). PDA seeds:
/// `[market, b"outcome-tally", outcome_index]`.
#[account]
#[derive(InitSpace)]
pub struct OutcomeTally {
    pub count: u8,
    pub _padding: [u8; OUTCOME_TALLY_ACCOUNT_SPACE_PADDING],
}

impl OutcomeTally {
    pub const LEN: usize = 8 + OutcomeTally::INIT_SPACE;
}
