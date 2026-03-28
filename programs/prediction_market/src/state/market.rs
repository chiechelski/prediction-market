#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

use crate::fees::{effective_deposit_platform_fee_bps, fee_amount_floor};

use super::market_type::MarketType;
pub const MARKET_ACCOUNT_SPACE_PADDING: usize = 64;

pub const MAX_MARKET_TITLE_LEN: usize = 128;

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub collateral_mint: Pubkey,
    pub collateral_decimals: u8,
    pub vault: Pubkey,
    pub outcome_count: u8,
    pub close_at: i64,
    pub closed: bool,
    pub resolved_outcome_index: Option<u8>,
    pub voided: bool,
    pub resolution_threshold: u8,
    pub creator: Pubkey,
    pub creator_fee_bps: u16,
    pub creator_fee_account: Pubkey,
    /// 0 = use global `deposit_platform_fee_bps` — platform fee on **mint complete set** and **pari stake**.
    pub deposit_platform_fee_bps: u16,
    pub bump: u8,
    /// UTF-8 title shown in UIs (max 128 bytes).
    #[max_len(MAX_MARKET_TITLE_LEN)]
    pub title: String,
    /// `MarketCategory` PDA, or `Pubkey::default()` for uncategorized.
    pub category: Pubkey,
    pub market_type: MarketType,
    pub _padding: [u8; MARKET_ACCOUNT_SPACE_PADDING],
}

impl Market {
    /// `8` (discriminator) + `InitSpace` body
    pub const LEN: usize = 8 + Market::INIT_SPACE;

    pub fn is_closed(&self, clock: &Clock) -> bool {
        self.closed || clock.unix_timestamp >= self.close_at
    }

    pub fn is_resolved(&self) -> bool {
        self.resolved_outcome_index.is_some()
    }

    pub fn deposit_platform_fee_bps_effective(&self, global_bps: u16) -> u16 {
        effective_deposit_platform_fee_bps(self.deposit_platform_fee_bps, global_bps)
    }

    pub fn validate_fees(&self, global_bps: u16) -> bool {
        let platform = self.deposit_platform_fee_bps_effective(global_bps);
        platform + self.creator_fee_bps <= 10000
    }

    pub fn calculate_deposit_platform_fee(&self, amount: u64, global_bps: u16) -> u64 {
        let bps = self.deposit_platform_fee_bps_effective(global_bps);
        fee_amount_floor(amount, bps)
    }

    pub fn calculate_creator_fee(&self, amount: u64) -> u64 {
        fee_amount_floor(amount, self.creator_fee_bps)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_account_space_matches_init_space() {
        let m = Market {
            collateral_mint: Pubkey::new_unique(),
            collateral_decimals: 6,
            vault: Pubkey::new_unique(),
            outcome_count: 2,
            close_at: 0,
            closed: false,
            resolved_outcome_index: Some(0),
            voided: false,
            resolution_threshold: 1,
            creator: Pubkey::new_unique(),
            creator_fee_bps: 0,
            creator_fee_account: Pubkey::new_unique(),
            deposit_platform_fee_bps: 0,
            bump: 255,
            title: "a".repeat(MAX_MARKET_TITLE_LEN),
            category: Pubkey::new_unique(),
            market_type: MarketType::CompleteSet,
            _padding: [0u8; MARKET_ACCOUNT_SPACE_PADDING],
        };
        let body = m.try_to_vec().expect("serialize");
        assert_eq!(8 + body.len(), Market::LEN);
    }
}
