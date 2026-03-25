#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use crate::utils::transfer_checked;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RedeemCompleteSetArgs {
    pub market_id: u64,
}

pub fn handler(ctx: Context<RedeemCompleteSet>, args: RedeemCompleteSetArgs) -> Result<()> {
    let clock = Clock::get()?;
    let market = &ctx.accounts.market;
    let open = !market.is_closed(&clock);
    let allowed = open || market.voided || market.is_resolved();
    require!(allowed, PredictionMarketError::MarketClosed);

    let decimals = ctx.accounts.collateral_mint.decimals;
    // 1 complete set = 1 token of each outcome (in base units = 10^decimals)
    let collateral_amount = 10_u64.saturating_pow(decimals as u32);
    let one_set = collateral_amount;

    let outcome_count = market.outcome_count as usize;
    let user = ctx.accounts.user.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();

    let outcome_sources = [
        &ctx.accounts.user_outcome_0,
        &ctx.accounts.user_outcome_1,
        &ctx.accounts.user_outcome_2,
        &ctx.accounts.user_outcome_3,
        &ctx.accounts.user_outcome_4,
        &ctx.accounts.user_outcome_5,
        &ctx.accounts.user_outcome_6,
        &ctx.accounts.user_outcome_7,
    ];
    let outcome_mints = [
        &ctx.accounts.outcome_mint_0,
        &ctx.accounts.outcome_mint_1,
        &ctx.accounts.outcome_mint_2,
        &ctx.accounts.outcome_mint_3,
        &ctx.accounts.outcome_mint_4,
        &ctx.accounts.outcome_mint_5,
        &ctx.accounts.outcome_mint_6,
        &ctx.accounts.outcome_mint_7,
    ];
    for i in 0..outcome_count {
        let cpi_accounts = Burn {
            mint: outcome_mints[i].to_account_info(),
            from: outcome_sources[i].to_account_info(),
            authority: user.clone(),
        };
        let cpi_ctx = CpiContext::new(token_program.clone(), cpi_accounts);
        token::burn(cpi_ctx, one_set)?;
    }

    let market_id_bytes = args.market_id.to_le_bytes();
    let market_seeds: &[&[u8]] = &[
        b"market",
        market.creator.as_ref(),
        market_id_bytes.as_ref(),
        &[market.bump],
    ];

    transfer_checked(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.user_collateral_account.to_account_info(),
        &ctx.accounts.collateral_mint,
        &ctx.accounts.market.to_account_info(),
        &ctx.accounts.collateral_token_program,
        collateral_amount,
        decimals,
        &[market_seeds],
    )?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: RedeemCompleteSetArgs)]
pub struct RedeemCompleteSet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [market.key().as_ref(), b"vault"],
        bump,
        constraint = vault.key() == market.vault,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub collateral_mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,

    #[account(
        mut,
        constraint = user_collateral_account.owner == user.key(),
        constraint = user_collateral_account.mint == collateral_mint.key(),
    )]
    pub user_collateral_account: Account<'info, TokenAccount>,

    #[account(mut, seeds = [market.key().as_ref(), b"outcome-mint", &[0]], bump)]
    pub outcome_mint_0: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [market.key().as_ref(), b"outcome-mint", &[1]], bump)]
    pub outcome_mint_1: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [market.key().as_ref(), b"outcome-mint", &[2]], bump)]
    pub outcome_mint_2: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [market.key().as_ref(), b"outcome-mint", &[3]], bump)]
    pub outcome_mint_3: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [market.key().as_ref(), b"outcome-mint", &[4]], bump)]
    pub outcome_mint_4: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [market.key().as_ref(), b"outcome-mint", &[5]], bump)]
    pub outcome_mint_5: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [market.key().as_ref(), b"outcome-mint", &[6]], bump)]
    pub outcome_mint_6: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [market.key().as_ref(), b"outcome-mint", &[7]], bump)]
    pub outcome_mint_7: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub user_outcome_0: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_outcome_1: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_outcome_2: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_outcome_3: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_outcome_4: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_outcome_5: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_outcome_6: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_outcome_7: Box<Account<'info, TokenAccount>>,

    pub collateral_token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
    pub token_program: Program<'info, Token>,
}
