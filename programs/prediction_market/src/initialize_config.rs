#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

pub fn handler(
    ctx: Context<InitializeConfig>,
    secondary_authority: Pubkey,
    platform_fee_bps: u16,
    platform_treasury: Pubkey,
    platform_fee_lamports: u64,
) -> Result<()> {
    require!(platform_fee_bps <= 10000, PredictionMarketError::InvalidFeeBps);
    let config = &mut ctx.accounts.global_config;
    config.authority = ctx.accounts.authority.key();
    config.secondary_authority = secondary_authority;
    config.platform_fee_bps = platform_fee_bps;
    config.platform_treasury = platform_treasury;
    config.platform_fee_lamports = platform_fee_lamports;
    config.next_category_id = 0;
    config._padding = [0u8; GLOBAL_CONFIG_ACCOUNT_SPACE_PADDING];
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = GLOBAL_CONFIG_ACCOUNT_SPACE,
        seeds = [b"global-config"],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// The wallet that signs this tx becomes the primary authority.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// New secondary authority (does NOT need to sign — the primary authority is responsible).
    /// Pass `Pubkey::default()` to leave it unset.
    pub secondary_authority: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}
