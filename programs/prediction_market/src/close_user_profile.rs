#![allow(clippy::result_large_err)]

use crate::state::user_profile::UserProfile;
use anchor_lang::prelude::*;

pub fn handler(_ctx: Context<CloseUserProfile>) -> Result<()> {
    // Anchor's `close = wallet` constraint handles zeroing the account,
    // transferring lamports back to the wallet, and setting the discriminator
    // to the closed-account sentinel — nothing else needed here.
    Ok(())
}

#[derive(Accounts)]
pub struct CloseUserProfile<'info> {
    #[account(
        mut,
        close = wallet,
        seeds = [b"user-profile", wallet.key().as_ref()],
        bump,
    )]
    pub user_profile: Account<'info, UserProfile>,

    /// Must match the seeds — only the profile owner can close it.
    #[account(mut)]
    pub wallet: Signer<'info>,
}
