#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

pub fn handler(
    ctx: Context<UpdateConfig>,
    secondary_authority: Pubkey,
    platform_fee_bps: u16,
    platform_treasury: Pubkey,
    platform_fee_lamports: u64,
) -> Result<()> {
    require!(platform_fee_bps <= 10000, PredictionMarketError::InvalidFeeBps);
    let config = &mut ctx.accounts.global_config;
    require!(
        config.is_allowed_authority(ctx.accounts.authority.key()),
        PredictionMarketError::ConfigUnauthorized
    );
    // Rotate primary authority to whoever was passed as `new_authority`.
    config.authority = ctx.accounts.new_authority.key();
    config.secondary_authority = secondary_authority;
    config.platform_fee_bps = platform_fee_bps;
    config.platform_treasury = platform_treasury;
    config.platform_fee_lamports = platform_fee_lamports;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    /// Current authority (primary or secondary) — must sign.
    pub authority: Signer<'info>,

    /// The new primary authority after this update.
    /// Does NOT need to sign — pass the same key as `authority` to keep it unchanged.
    pub new_authority: SystemAccount<'info>,
}
