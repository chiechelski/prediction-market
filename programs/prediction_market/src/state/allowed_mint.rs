#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const ALLOWED_MINT_ACCOUNT_SPACE_PADDING: usize = 64;

/// Marker account: existence means this mint is allowed as collateral.
#[account]
#[derive(InitSpace)]
pub struct AllowedMint {
    pub mint: Pubkey,
    pub _padding: [u8; ALLOWED_MINT_ACCOUNT_SPACE_PADDING],
}

impl AllowedMint {
    pub const LEN: usize = 8 + AllowedMint::INIT_SPACE;
}
