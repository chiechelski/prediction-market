#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const OUTCOME_TALLY_ACCOUNT_SPACE_PADDING: usize = 40;

pub const OUTCOME_TALLY_ACCOUNT_SPACE: usize =
    8 + 1 + OUTCOME_TALLY_ACCOUNT_SPACE_PADDING; // discriminator + count + padding

/// Per-outcome vote counter for resolution (M-of-N). PDA seeds:
/// `[market, b"outcome-tally", outcome_index]`.
#[account]
pub struct OutcomeTally {
    pub count: u8,
    pub _padding: [u8; OUTCOME_TALLY_ACCOUNT_SPACE_PADDING],
}

impl OutcomeTally {
    pub const LEN: usize = OUTCOME_TALLY_ACCOUNT_SPACE;
}
