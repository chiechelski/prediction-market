#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

#[account]
pub struct ResolutionVote {
    pub outcome_index: u8,
}

impl ResolutionVote {
    pub const LEN: usize = 8 + 1;
}
