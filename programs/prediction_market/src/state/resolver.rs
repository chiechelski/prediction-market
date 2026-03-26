#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const RESOLVER_ACCOUNT_SPACE_PADDING: usize = 40;

pub const RESOLVER_ACCOUNT_SPACE: usize =
    8 + 32 + RESOLVER_ACCOUNT_SPACE_PADDING; // discriminator + resolver_pubkey + padding

/// Marker: this pubkey is a resolver for the market.
#[account]
pub struct Resolver {
    pub resolver_pubkey: Pubkey,
    pub _padding: [u8; RESOLVER_ACCOUNT_SPACE_PADDING],
}

impl Resolver {
    pub const LEN: usize = RESOLVER_ACCOUNT_SPACE;
}
