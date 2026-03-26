#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const MARKET_ACCOUNT_SPACE_PADDING: usize = 40;

pub const MARKET_ACCOUNT_SPACE: usize = 8 // discriminator
    + 32  // collateral_mint (Pubkey)
    + 1   // collateral_decimals (u8)
    + 32  // vault (Pubkey)
    + 1   // outcome_count (u8)
    + 8   // close_at (i64)
    + 1   // closed (bool)
    + 2   // resolved_outcome_index (Option<u8>, max: Some + u8)
    + 1   // voided (bool)
    + 1   // resolution_threshold (u8)
    + 32  // creator (Pubkey)
    + 2   // creator_fee_bps (u16)
    + 32  // creator_fee_account (Pubkey)
    + 2   // platform_fee_bps (u16)
    + 1   // bump (u8)
    + MARKET_ACCOUNT_SPACE_PADDING;

#[account]
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
    pub _padding: [u8; MARKET_ACCOUNT_SPACE_PADDING],
}

impl Market {
    pub const LEN: usize = MARKET_ACCOUNT_SPACE;

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
    fn market_account_space_matches_layout() {
        // Use `Some` so serialized size matches `MARKET_ACCOUNT_SPACE` (worst case for Option<u8>).
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
            _padding: [0u8; MARKET_ACCOUNT_SPACE_PADDING],
        };
        let body = m.try_to_vec().expect("serialize");
        assert_eq!(8 + body.len(), MARKET_ACCOUNT_SPACE);
    }
}
