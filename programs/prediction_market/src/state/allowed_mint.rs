#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const ALLOWED_MINT_ACCOUNT_SPACE_PADDING: usize = 40;

pub const ALLOWED_MINT_ACCOUNT_SPACE: usize =
    8 + 32 + ALLOWED_MINT_ACCOUNT_SPACE_PADDING; // discriminator + mint + padding

/// Marker account: existence means this mint is allowed as collateral.
#[account]
pub struct AllowedMint {
    pub mint: Pubkey,
    pub _padding: [u8; ALLOWED_MINT_ACCOUNT_SPACE_PADDING],
}

impl AllowedMint {
    pub const LEN: usize = ALLOWED_MINT_ACCOUNT_SPACE;
}
