#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const MAX_DISPLAY_NAME_LEN: usize = 50;
pub const MAX_URL_LEN: usize = 100;

/// discriminator(8) + string_prefix(4) + name(50) + string_prefix(4) + url(100) + verified(1) + padding(31)
pub const USER_PROFILE_SPACE: usize = 8 + 4 + MAX_DISPLAY_NAME_LEN + 4 + MAX_URL_LEN + 1 + 31;

#[account]
pub struct UserProfile {
    /// Optional display name chosen by the wallet owner. Max 50 bytes UTF-8.
    pub display_name: String,
    /// Optional URL (website / social). Max 100 bytes UTF-8.
    pub url: String,
    /// Set exclusively by the platform authority via `verify_user_profile`.
    pub verified: bool,
    pub _padding: [u8; 31],
}

impl UserProfile {
    pub const LEN: usize = USER_PROFILE_SPACE;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_profile_space_matches_layout() {
        let profile = UserProfile {
            display_name: "a".repeat(MAX_DISPLAY_NAME_LEN),
            url: "b".repeat(MAX_URL_LEN),
            verified: true,
            _padding: [0u8; 31],
        };
        let body = profile.try_to_vec().expect("serialize");
        assert_eq!(
            8 + body.len(),
            USER_PROFILE_SPACE,
            "discriminator + borsh body must equal USER_PROFILE_SPACE"
        );
    }
}
