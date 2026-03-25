#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<InitializeConfig>, platform_fee_bps: u16, platform_treasury: Pubkey) -> Result<()> {
    require!(platform_fee_bps <= 10000, PredictionMarketError::InvalidFeeBps);
    let config = &mut ctx.accounts.global_config;
    config.authority = ctx.accounts.authority.key();
    config.platform_fee_bps = platform_fee_bps;
    config.platform_treasury = platform_treasury;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = GlobalConfig::LEN,
        seeds = [b"global-config"],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
