#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

/// Marker account: existence means this mint is allowed as collateral.
#[account]
pub struct AllowedMint {
    pub mint: Pubkey,
}

impl AllowedMint {
    pub const LEN: usize = 8 + 32;
}
