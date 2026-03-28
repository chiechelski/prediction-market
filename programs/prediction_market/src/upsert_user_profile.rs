#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::user_profile::{UserProfile, MAX_DISPLAY_NAME_LEN, MAX_URL_LEN};
use anchor_lang::prelude::*;

pub fn handler(
    ctx: Context<UpsertUserProfile>,
    display_name: String,
    url: String,
) -> Result<()> {
    require!(
        display_name.len() <= MAX_DISPLAY_NAME_LEN,
        PredictionMarketError::DisplayNameTooLong
    );
    require!(
        url.len() <= MAX_URL_LEN,
        PredictionMarketError::UrlTooLong
    );

    let profile = &mut ctx.accounts.user_profile;

    // Preserve verified flag on updates; initialise to false on first create.
    // Anchor's init_if_needed sets all bytes to zero on first init, so
    // `profile.verified` is already false — we just never overwrite it here.
    profile.display_name = display_name;
    profile.url = url;

    Ok(())
}

#[derive(Accounts)]
pub struct UpsertUserProfile<'info> {
    #[account(
        init_if_needed,
        payer = wallet,
        space = UserProfile::LEN,
        seeds = [b"user-profile", wallet.key().as_ref()],
        bump,
    )]
    pub user_profile: Account<'info, UserProfile>,

    /// The wallet owner — pays rent on first creation, signs all updates.
    #[account(mut)]
    pub wallet: Signer<'info>,

    pub system_program: Program<'info, System>,
}
