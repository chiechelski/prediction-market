#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

/// Marker: this pubkey is a resolver for the market.
#[account]
pub struct Resolver {
    pub resolver_pubkey: Pubkey,
}

impl Resolver {
    pub const LEN: usize = 8 + 32;
}
