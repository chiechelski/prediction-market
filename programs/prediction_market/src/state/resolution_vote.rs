#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const RESOLUTION_VOTE_ACCOUNT_SPACE_PADDING: usize = 64;

/// One PDA per resolver slot (`[market, b"vote", resolver_index]`).
/// A resolver may only have one active vote at a time: vote sets `has_voted`,
/// revoke clears it so they can vote again (1 → 0 → 1 when changing outcome).
#[account]
#[derive(InitSpace)]
pub struct ResolutionVote {
    pub has_voted: bool,
    pub outcome_index: u8,
    pub _padding: [u8; RESOLUTION_VOTE_ACCOUNT_SPACE_PADDING],
}

impl ResolutionVote {
    pub const LEN: usize = 8 + ResolutionVote::INIT_SPACE;
}
