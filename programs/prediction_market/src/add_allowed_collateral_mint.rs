#![allow(clippy::result_large_err)]

use crate::state::*;
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<AddAllowedCollateralMint>) -> Result<()> {
    require!(
        ctx.accounts.global_config.is_authority(&ctx.accounts.authority.key()),
        crate::errors::PredictionMarketError::ConfigUnauthorized
    );
    let allowed = &mut ctx.accounts.allowed_mint;
    allowed.mint = ctx.accounts.mint.key();
    Ok(())
}

#[derive(Accounts)]
pub struct AddAllowedCollateralMint<'info> {
    #[account(
        init,
        payer = authority,
        space = AllowedMint::LEN,
        seeds = [b"allowed-mint", mint.key().as_ref()],
        bump,
    )]
    pub allowed_mint: Account<'info, AllowedMint>,

    #[account(mut, seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: SPL or Token-2022 mint account; validated off-chain — any mint address can be allowlisted.
    pub mint: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
