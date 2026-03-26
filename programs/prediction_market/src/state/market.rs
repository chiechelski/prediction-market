#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

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
    /// 0 = use global config default
    pub platform_fee_bps: u16,
    pub bump: u8,
    /// UTF-8 title shown in UIs (max 128 bytes).
    #[max_len(MAX_MARKET_TITLE_LEN)]
    pub title: String,
    /// `MarketCategory` PDA, or `Pubkey::default()` for uncategorized.
    pub category: Pubkey,
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

    pub fn platform_fee_bps_effective(&self, global_bps: u16) -> u16 {
        if self.platform_fee_bps > 0 {
            self.platform_fee_bps
        } else {
            global_bps
        }
    }

    pub fn validate_fees(&self, global_bps: u16) -> bool {
        let platform = self.platform_fee_bps_effective(global_bps);
        platform + self.creator_fee_bps <= 10000
    }

    pub fn calculate_platform_fee(&self, amount: u64, global_bps: u16) -> u64 {
        let bps = self.platform_fee_bps_effective(global_bps);
        if bps > 10000 {
            return 0;
        }
        (amount as u128 * bps as u128 / 10000) as u64
    }

    pub fn calculate_creator_fee(&self, amount: u64) -> u64 {
        if self.creator_fee_bps > 10000 {
            return 0;
        }
        (amount as u128 * self.creator_fee_bps as u128 / 10000) as u64
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
            platform_fee_bps: 0,
            bump: 255,
            title: "a".repeat(MAX_MARKET_TITLE_LEN),
            category: Pubkey::new_unique(),
        };
        let body = m.try_to_vec().expect("serialize");
        assert_eq!(8 + body.len(), Market::LEN);
    }
}
