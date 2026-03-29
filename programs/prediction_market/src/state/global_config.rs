#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const GLOBAL_CONFIG_ACCOUNT_SPACE_PADDING: usize = 64;

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub authority: Pubkey,
    /// Backup authority — same permissions as `authority`. `Pubkey::default()` disables.
    pub secondary_authority: Pubkey,
    /// Default platform fee on **complete-set mint** and **pari-mutuel stake** (deposit collateral):
    /// basis points of **net** collateral credited to the vault / pool (`amount` in those instructions).
    /// Per-market override: `Market::deposit_platform_fee_bps` or `0` to use this.
    pub deposit_platform_fee_bps: u16,
    /// Wallet that receives platform token fees (ATA derived per collateral mint).
    pub platform_treasury: Pubkey,
    /// Flat SOL fee (lamports) per user mint, redeem, pari stake, and pari withdraw.
    pub platform_fee_lamports: u64,
    /// Next id for `MarketCategory` PDAs (`[b"market-category", id.to_le_bytes()]`).
    pub next_category_id: u64,
    /// Default **protocol** share of the **penalty surplus** on pari-mutuel early withdraw (after the
    /// pool keeps its slice). The creator chooses the complementary share at `initialize_parimutuel_state`;
    /// the two must sum to 10000 bps. Stored in `ParimutuelState` at pool init.
    pub parimutuel_penalty_protocol_share_bps: u16,
    /// Platform fee on **pari-mutuel early withdraw**: basis points of **gross** `amount` (withdrawal size).
    /// Taken from the post-penalty **refund** slice (capped so the user never receives less than zero).
    pub parimutuel_withdraw_platform_fee_bps: u16,
    pub _padding: [u8; GLOBAL_CONFIG_ACCOUNT_SPACE_PADDING],
}

impl GlobalConfig {
    /// `8` (discriminator) + `InitSpace` body (includes `_padding`).
    pub const LEN: usize = 8 + GlobalConfig::INIT_SPACE;

    pub fn is_allowed_authority(&self, key: Pubkey) -> bool {
        self.authority == key
            || (self.secondary_authority != Pubkey::default()
                && self.secondary_authority == key)
    }

    pub fn is_platform_treasury_wallet(&self, key: Pubkey) -> bool {
        self.platform_treasury == key
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn global_config_account_space_matches_init_space() {
        let cfg = GlobalConfig {
            authority: Pubkey::new_unique(),
            secondary_authority: Pubkey::new_unique(),
            deposit_platform_fee_bps: 0,
            platform_treasury: Pubkey::new_unique(),
            platform_fee_lamports: 0,
            next_category_id: 0,
            parimutuel_penalty_protocol_share_bps: 0,
            parimutuel_withdraw_platform_fee_bps: 0,
            _padding: [0u8; GLOBAL_CONFIG_ACCOUNT_SPACE_PADDING],
        };
        let body = cfg.try_to_vec().expect("serialize");
        assert_eq!(
            8 + body.len(),
            GlobalConfig::LEN,
            "discriminator + borsh body must equal GlobalConfig::LEN"
        );
    }
}
