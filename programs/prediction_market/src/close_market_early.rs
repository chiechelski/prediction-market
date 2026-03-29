#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

/// Close the market early. Allowed by market creator or global config primary/secondary authority.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CloseMarketEarlyArgs {
    pub market_id: u64,
}

pub fn handler(ctx: Context<CloseMarketEarly>, _args: CloseMarketEarlyArgs) -> Result<()> {
    let signer = ctx.accounts.signer.key();
    let market = &ctx.accounts.market;
    let is_creator = signer == market.creator;
    let is_global_authority = ctx
        .accounts
        .global_config
        .is_allowed_authority(signer);
    require!(
        is_creator || is_global_authority,
        PredictionMarketError::OnlyCreatorOrGlobalAuthority
    );

    let market = &mut ctx.accounts.market;
    market.closed = true;
    Ok(())
}

#[derive(Accounts)]
#[instruction(args: CloseMarketEarlyArgs)]
pub struct CloseMarketEarly<'info> {
    pub signer: Signer<'info>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
}
