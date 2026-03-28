#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const RESOLVER_ACCOUNT_SPACE_PADDING: usize = 64;

/// Marker: this pubkey is a resolver for the market.
#[account]
#[derive(InitSpace)]
pub struct Resolver {
    pub resolver_pubkey: Pubkey,
    pub _padding: [u8; RESOLVER_ACCOUNT_SPACE_PADDING],
}

impl Resolver {
    pub const LEN: usize = 8 + Resolver::INIT_SPACE;
}
