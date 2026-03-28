#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const MARKET_CATEGORY_ACCOUNT_SPACE_PADDING: usize = 96;

/// Max UTF-8 bytes for [`MarketCategory::name`].
pub const MAX_MARKET_CATEGORY_NAME_LEN: usize = 64;

/// On-chain category label; PDA seeds: `["market-category", id.to_le_bytes()]`.
#[account]
#[derive(InitSpace)]
pub struct MarketCategory {
    /// Monotonic id (matches PDA seed).
    pub id: u64,
    #[max_len(MAX_MARKET_CATEGORY_NAME_LEN)]
    pub name: String,
    pub active: bool,
    pub bump: u8,
    pub _padding: [u8; MARKET_CATEGORY_ACCOUNT_SPACE_PADDING],
}

impl MarketCategory {
    /// `8` (discriminator) + `InitSpace` body (includes `_padding`).
    pub const LEN: usize = 8 + MarketCategory::INIT_SPACE;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_category_account_space_matches_init_space() {
        let cat = MarketCategory {
            id: 0,
            name: "a".repeat(MAX_MARKET_CATEGORY_NAME_LEN),
            active: true,
            bump: 255,
            _padding: [0u8; MARKET_CATEGORY_ACCOUNT_SPACE_PADDING],
        };
        let body = cat.try_to_vec().expect("serialize");
        assert_eq!(
            8 + body.len(),
            MarketCategory::LEN,
            "discriminator + borsh body must equal MarketCategory::LEN"
        );
    }
}
