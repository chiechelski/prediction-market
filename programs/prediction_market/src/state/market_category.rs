#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

/// Max UTF-8 bytes for [`MarketCategory::name`].
pub const MAX_MARKET_CATEGORY_NAME_LEN: usize = 64;

/// Reserved tail on `MarketCategory` for future fields without `realloc`.
pub const MARKET_CATEGORY_ACCOUNT_SPACE_PADDING: usize = 64;

/// `8` discriminator + `InitSpace` body (includes `_padding`).
pub const MARKET_CATEGORY_ACCOUNT_SPACE: usize = 8 + MarketCategory::INIT_SPACE;

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
    /// Alias for `init` / `realloc` — same as [`MARKET_CATEGORY_ACCOUNT_SPACE`].
    pub const LEN: usize = MARKET_CATEGORY_ACCOUNT_SPACE;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_category_account_space_matches_layout() {
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
            MARKET_CATEGORY_ACCOUNT_SPACE,
            "discriminator + borsh body must equal MARKET_CATEGORY_ACCOUNT_SPACE"
        );
    }
}
