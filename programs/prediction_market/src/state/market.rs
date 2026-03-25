#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

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
}

impl Market {
    pub const LEN: usize = 8
        + 32  // collateral_mint
        + 1   // collateral_decimals
        + 32  // vault
        + 1   // outcome_count
        + 8   // close_at i64
        + 1   // closed
        + 2   // Option<u8>: 1 + 1
        + 1   // voided
        + 1   // resolution_threshold
        + 32  // creator
        + 2   // creator_fee_bps
        + 32  // creator_fee_account
        + 2   // platform_fee_bps
        + 1;  // bump

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
