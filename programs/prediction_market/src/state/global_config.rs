#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

/// Reserved tail on `GlobalConfig` for future fields without `realloc`.
pub const GLOBAL_CONFIG_ACCOUNT_SPACE_PADDING: usize = 64;

/// `8` discriminator + serialized fields + padding (see `GlobalConfig`).
pub const GLOBAL_CONFIG_ACCOUNT_SPACE: usize = 8 // discriminator
    + 32  // authority (Pubkey)
    + 32  // secondary_authority (Pubkey)
    + 2   // platform_fee_bps (u16)
    + 32  // platform_treasury (Pubkey)
    + 8   // platform_fee_lamports (u64)
    + GLOBAL_CONFIG_ACCOUNT_SPACE_PADDING;

#[account]
pub struct GlobalConfig {
    pub authority: Pubkey,
    /// Backup authority — same permissions as `authority`. `Pubkey::default()` disables.
    pub secondary_authority: Pubkey,
    pub platform_fee_bps: u16,
    /// Wallet that receives platform token fees (ATA derived per collateral mint).
    pub platform_treasury: Pubkey,
    /// Flat SOL fee (lamports) per user mint / redeem.
    pub platform_fee_lamports: u64,
    pub _padding: [u8; GLOBAL_CONFIG_ACCOUNT_SPACE_PADDING],
}

impl GlobalConfig {
    /// Alias for `init` / `realloc` — same as [`GLOBAL_CONFIG_ACCOUNT_SPACE`].
    pub const LEN: usize = GLOBAL_CONFIG_ACCOUNT_SPACE;

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
    fn global_config_account_space_matches_layout() {
        let cfg = GlobalConfig {
            authority: Pubkey::new_unique(),
            secondary_authority: Pubkey::new_unique(),
            platform_fee_bps: 0,
            platform_treasury: Pubkey::new_unique(),
            platform_fee_lamports: 0,
            _padding: [0u8; GLOBAL_CONFIG_ACCOUNT_SPACE_PADDING],
        };
        let body = cfg.try_to_vec().expect("serialize");
        assert_eq!(
            8 + body.len(),
            GLOBAL_CONFIG_ACCOUNT_SPACE,
            "discriminator + borsh body must equal GLOBAL_CONFIG_ACCOUNT_SPACE"
        );
    }
}
