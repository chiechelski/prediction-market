#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const USER_PROFILE_ACCOUNT_SPACE_PADDING: usize = 64;

pub const MAX_DISPLAY_NAME_LEN: usize = 50;
pub const MAX_URL_LEN: usize = 100;

#[account]
#[derive(InitSpace)]
pub struct UserProfile {
    /// Optional display name chosen by the wallet owner. Max 50 bytes UTF-8.
    #[max_len(MAX_DISPLAY_NAME_LEN)]
    pub display_name: String,
    /// Optional URL (website / social). Max 100 bytes UTF-8.
    #[max_len(MAX_URL_LEN)]
    pub url: String,
    /// Set exclusively by the platform authority via `verify_user_profile`.
    pub verified: bool,
    pub _padding: [u8; USER_PROFILE_ACCOUNT_SPACE_PADDING],
}

impl UserProfile {
    pub const LEN: usize = 8 + UserProfile::INIT_SPACE;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_profile_space_matches_init_space() {
        let profile = UserProfile {
            display_name: "a".repeat(MAX_DISPLAY_NAME_LEN),
            url: "b".repeat(MAX_URL_LEN),
            verified: true,
            _padding: [0u8; USER_PROFILE_ACCOUNT_SPACE_PADDING],
        };
        let body = profile.try_to_vec().expect("serialize");
        assert_eq!(
            8 + body.len(),
            UserProfile::LEN,
            "discriminator + borsh body must equal UserProfile::LEN"
        );
    }
}
