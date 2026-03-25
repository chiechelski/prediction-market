#![allow(clippy::result_large_err)]

use crate::state::*;
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<RemoveAllowedCollateralMint>) -> Result<()> {
    require!(
        ctx.accounts.global_config.is_authority(&ctx.accounts.authority.key()),
        crate::errors::PredictionMarketError::ConfigUnauthorized
    );
    Ok(())
}

#[derive(Accounts)]
pub struct RemoveAllowedCollateralMint<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [b"allowed-mint", mint.key().as_ref()],
        bump,
    )]
    pub allowed_mint: Account<'info, AllowedMint>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: mint address is used only as PDA seed to derive allowed_mint; no data is read.
    pub mint: AccountInfo<'info>,
}
