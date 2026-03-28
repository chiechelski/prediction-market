#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

/// Third step of market creation: initializes **8** outcome mint PDAs (protocol maximum).
/// Trading uses only `market.outcome_count` mints; the rest remain empty but rent-funded.
/// Decimals are inherited from `market.collateral_decimals` (stored during `create_market`),
/// so 1 outcome token ≡ 1 collateral token.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeMarketMintsArgs {
    pub market_id: u64,
}

pub fn handler(
    ctx: Context<InitializeMarketMints>,
    _args: InitializeMarketMintsArgs,
) -> Result<()> {
    require!(
        ctx.accounts.market.market_type == MarketType::CompleteSet,
        PredictionMarketError::WrongMarketType
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(args: InitializeMarketMintsArgs)]
pub struct InitializeMarketMints<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,

    #[account(init, payer = payer, seeds = [market.key().as_ref(), b"outcome-mint".as_ref(), &[0u8]], bump, mint::decimals = market.collateral_decimals, mint::authority = market, mint::token_program = token_program)]
    pub outcome_mint_0: Account<'info, Mint>,
    #[account(init, payer = payer, seeds = [market.key().as_ref(), b"outcome-mint".as_ref(), &[1u8]], bump, mint::decimals = market.collateral_decimals, mint::authority = market, mint::token_program = token_program)]
    pub outcome_mint_1: Account<'info, Mint>,
    #[account(init, payer = payer, seeds = [market.key().as_ref(), b"outcome-mint".as_ref(), &[2u8]], bump, mint::decimals = market.collateral_decimals, mint::authority = market, mint::token_program = token_program)]
    pub outcome_mint_2: Account<'info, Mint>,
    #[account(init, payer = payer, seeds = [market.key().as_ref(), b"outcome-mint".as_ref(), &[3u8]], bump, mint::decimals = market.collateral_decimals, mint::authority = market, mint::token_program = token_program)]
    pub outcome_mint_3: Account<'info, Mint>,
    #[account(init, payer = payer, seeds = [market.key().as_ref(), b"outcome-mint".as_ref(), &[4u8]], bump, mint::decimals = market.collateral_decimals, mint::authority = market, mint::token_program = token_program)]
    pub outcome_mint_4: Account<'info, Mint>,
    #[account(init, payer = payer, seeds = [market.key().as_ref(), b"outcome-mint".as_ref(), &[5u8]], bump, mint::decimals = market.collateral_decimals, mint::authority = market, mint::token_program = token_program)]
    pub outcome_mint_5: Account<'info, Mint>,
    #[account(init, payer = payer, seeds = [market.key().as_ref(), b"outcome-mint".as_ref(), &[6u8]], bump, mint::decimals = market.collateral_decimals, mint::authority = market, mint::token_program = token_program)]
    pub outcome_mint_6: Account<'info, Mint>,
    #[account(init, payer = payer, seeds = [market.key().as_ref(), b"outcome-mint".as_ref(), &[7u8]], bump, mint::decimals = market.collateral_decimals, mint::authority = market, mint::token_program = token_program)]
    pub outcome_mint_7: Account<'info, Mint>,
}
