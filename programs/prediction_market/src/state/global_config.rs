#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

#[account]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub platform_fee_bps: u16,
    pub platform_treasury: Pubkey,
}

impl GlobalConfig {
    pub const LEN: usize = 8 + 32 + 2 + 32;

    pub fn is_authority(&self, key: &Pubkey) -> bool {
        self.authority == *key
    }
}
