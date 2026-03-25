#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

/// Void the market. Allowed by market creator or any resolver. Rejected if already resolved.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct VoidMarketArgs {
    pub market_id: u64,
}

pub fn handler(ctx: Context<VoidMarket>, _args: VoidMarketArgs) -> Result<()> {
    require!(
        !ctx.accounts.market.is_resolved(),
        PredictionMarketError::CannotVoidResolvedMarket
    );

    let signer = ctx.accounts.signer.key();
    let market = &ctx.accounts.market;
    let is_creator = signer == market.creator;
    let is_resolver = [
        &ctx.accounts.resolver_0,
        &ctx.accounts.resolver_1,
        &ctx.accounts.resolver_2,
        &ctx.accounts.resolver_3,
        &ctx.accounts.resolver_4,
        &ctx.accounts.resolver_5,
        &ctx.accounts.resolver_6,
        &ctx.accounts.resolver_7,
    ]
    .iter()
    .any(|r| r.resolver_pubkey == signer);
    require!(
        is_creator || is_resolver,
        PredictionMarketError::OnlyCreatorOrResolver
    );

    let market = &mut ctx.accounts.market;
    market.voided = true;
    Ok(())
}

#[derive(Accounts)]
#[instruction(args: VoidMarketArgs)]
pub struct VoidMarket<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(seeds = [market.key().as_ref(), b"resolver", &[0]], bump)]
    pub resolver_0: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[1]], bump)]
    pub resolver_1: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[2]], bump)]
    pub resolver_2: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[3]], bump)]
    pub resolver_3: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[4]], bump)]
    pub resolver_4: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[5]], bump)]
    pub resolver_5: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[6]], bump)]
    pub resolver_6: Box<Account<'info, Resolver>>,
    #[account(seeds = [market.key().as_ref(), b"resolver", &[7]], bump)]
    pub resolver_7: Box<Account<'info, Resolver>>,
}
