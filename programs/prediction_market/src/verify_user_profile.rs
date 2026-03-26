#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::global_config::GlobalConfig;
use crate::state::user_profile::UserProfile;
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<VerifyUserProfile>, verified: bool) -> Result<()> {
    require!(
        ctx.accounts
            .global_config
            .is_allowed_authority(ctx.accounts.authority.key()),
        PredictionMarketError::ConfigUnauthorized
    );

    ctx.accounts.user_profile.verified = verified;
    Ok(())
}

#[derive(Accounts)]
#[instruction(verified: bool)]
pub struct VerifyUserProfile<'info> {
    /// The profile to verify. Must already exist — user must have called
    /// `upsert_user_profile` first. The `target_wallet` key is embedded in the
    /// PDA seeds so the authority must pass the correct account.
    #[account(
        mut,
        seeds = [b"user-profile", target_wallet.key().as_ref()],
        bump,
    )]
    pub user_profile: Account<'info, UserProfile>,

    /// The wallet whose profile is being verified (not required to sign).
    /// CHECK: used only as a seed component — no data read from this account.
    pub target_wallet: UncheckedAccount<'info>,

    /// Platform primary or secondary authority.
    pub authority: Signer<'info>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,
}
