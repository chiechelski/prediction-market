#![allow(clippy::result_large_err)]

use crate::state::*;
use anchor_lang::prelude::*;

/// Third step of market creation: initializes the 8 resolver PDAs and writes the provided pubkeys.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeMarketResolversArgs {
    pub market_id: u64,
    pub resolver_pubkeys: [Pubkey; 8],
    pub num_resolvers: u8,
}

pub fn handler(
    ctx: Context<InitializeMarketResolvers>,
    args: InitializeMarketResolversArgs,
) -> Result<()> {
    let resolvers = [
        &mut ctx.accounts.resolver_0,
        &mut ctx.accounts.resolver_1,
        &mut ctx.accounts.resolver_2,
        &mut ctx.accounts.resolver_3,
        &mut ctx.accounts.resolver_4,
        &mut ctx.accounts.resolver_5,
        &mut ctx.accounts.resolver_6,
        &mut ctx.accounts.resolver_7,
    ];
    for i in 0..args.num_resolvers as usize {
        resolvers[i].resolver_pubkey = args.resolver_pubkeys[i];
    }
    Ok(())
}

#[derive(Accounts)]
#[instruction(args: InitializeMarketResolversArgs)]
pub struct InitializeMarketResolvers<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,

    #[account(init, payer = payer, space = Resolver::LEN, seeds = [market.key().as_ref(), b"resolver", &[0]], bump)]
    pub resolver_0: Account<'info, Resolver>,
    #[account(init, payer = payer, space = Resolver::LEN, seeds = [market.key().as_ref(), b"resolver", &[1]], bump)]
    pub resolver_1: Account<'info, Resolver>,
    #[account(init, payer = payer, space = Resolver::LEN, seeds = [market.key().as_ref(), b"resolver", &[2]], bump)]
    pub resolver_2: Account<'info, Resolver>,
    #[account(init, payer = payer, space = Resolver::LEN, seeds = [market.key().as_ref(), b"resolver", &[3]], bump)]
    pub resolver_3: Account<'info, Resolver>,
    #[account(init, payer = payer, space = Resolver::LEN, seeds = [market.key().as_ref(), b"resolver", &[4]], bump)]
    pub resolver_4: Account<'info, Resolver>,
    #[account(init, payer = payer, space = Resolver::LEN, seeds = [market.key().as_ref(), b"resolver", &[5]], bump)]
    pub resolver_5: Account<'info, Resolver>,
    #[account(init, payer = payer, space = Resolver::LEN, seeds = [market.key().as_ref(), b"resolver", &[6]], bump)]
    pub resolver_6: Account<'info, Resolver>,
    #[account(init, payer = payer, space = Resolver::LEN, seeds = [market.key().as_ref(), b"resolver", &[7]], bump)]
    pub resolver_7: Account<'info, Resolver>,
}
