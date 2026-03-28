#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const PARIMUTUEL_POSITION_ACCOUNT_SPACE_PADDING: usize = 64;

/// PDA seeds: `[b"pari-pos", market.key(), user.key(), &[outcome_index]]`.
#[account]
#[derive(InitSpace)]
pub struct ParimutuelPosition {
    pub market: Pubkey,
    pub user: Pubkey,
    pub outcome_index: u8,
    pub active_stake: u64,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub claimed: bool,
    pub bump: u8,
    pub _padding: [u8; PARIMUTUEL_POSITION_ACCOUNT_SPACE_PADDING],
}

impl ParimutuelPosition {
    pub const LEN: usize = 8 + ParimutuelPosition::INIT_SPACE;
}
