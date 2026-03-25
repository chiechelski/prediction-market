#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use crate::utils::transfer_checked;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct MintCompleteSetArgs {
    pub amount: u64,
    pub market_id: u64,
}

pub fn handler(ctx: Context<MintCompleteSet>, args: MintCompleteSetArgs) -> Result<()> {
    let clock = Clock::get()?;
    let market = &ctx.accounts.market;
    require!(!market.is_closed(&clock), PredictionMarketError::MarketClosed);
    require!(!market.voided, PredictionMarketError::MarketVoided);
    require!(args.amount > 0, PredictionMarketError::ZeroMintAmount);

    let global_bps = ctx.accounts.global_config.platform_fee_bps;
    let platform_fee = market.calculate_platform_fee(args.amount, global_bps);
    let creator_fee = market.calculate_creator_fee(args.amount);
    let net = args
        .amount
        .checked_sub(platform_fee)
        .and_then(|n| n.checked_sub(creator_fee))
        .ok_or(PredictionMarketError::InvalidFeeBps)?;

    let decimals = ctx.accounts.collateral_mint.decimals;
    let from = ctx.accounts.user_collateral_account.to_account_info();
    let authority = ctx.accounts.user.to_account_info();

    transfer_checked(
        &from,
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.collateral_mint,
        &authority,
        &ctx.accounts.collateral_token_program,
        net,
        decimals,
        &[],
    )?;
    if platform_fee > 0 {
        transfer_checked(
            &from,
            &ctx.accounts.platform_treasury.to_account_info(),
            &ctx.accounts.collateral_mint,
            &authority,
            &ctx.accounts.collateral_token_program,
            platform_fee,
            decimals,
            &[],
        )?;
    }
    if creator_fee > 0 {
        transfer_checked(
            &from,
            &ctx.accounts.creator_fee_account.to_account_info(),
            &ctx.accounts.collateral_mint,
            &authority,
            &ctx.accounts.collateral_token_program,
            creator_fee,
            decimals,
            &[],
        )?;
    }

    let market_id_bytes = args.market_id.to_le_bytes();
    let market_seeds: &[&[u8]] = &[
        b"market",
        market.creator.as_ref(),
        market_id_bytes.as_ref(),
        &[ctx.accounts.market.bump],
    ];
    let signer_seeds: &[&[&[u8]]] = &[market_seeds];

    let outcome_count = market.outcome_count as usize;
    let outcome_accounts = [
        (&ctx.accounts.outcome_mint_0, &ctx.accounts.user_outcome_0),
        (&ctx.accounts.outcome_mint_1, &ctx.accounts.user_outcome_1),
        (&ctx.accounts.outcome_mint_2, &ctx.accounts.user_outcome_2),
        (&ctx.accounts.outcome_mint_3, &ctx.accounts.user_outcome_3),
        (&ctx.accounts.outcome_mint_4, &ctx.accounts.user_outcome_4),
        (&ctx.accounts.outcome_mint_5, &ctx.accounts.user_outcome_5),
        (&ctx.accounts.outcome_mint_6, &ctx.accounts.user_outcome_6),
        (&ctx.accounts.outcome_mint_7, &ctx.accounts.user_outcome_7),
    ];
    for (mint, dest) in outcome_accounts.iter().take(outcome_count) {
        let cpi_accounts = MintTo {
            mint: mint.to_account_info(),
            to: dest.to_account_info(),
            authority: ctx.accounts.market.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::mint_to(cpi_ctx, net)?;
    }

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: MintCompleteSetArgs)]
pub struct MintCompleteSet<'info> {
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
    pub vault: Box<Account<'info, TokenAccount>>,

    pub collateral_mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,

    #[account(
        mut,
        constraint = user_collateral_account.owner == user.key(),
        constraint = user_collateral_account.mint == collateral_mint.key(),
    )]
    pub user_collateral_account: Box<Account<'info, TokenAccount>>,

    #[account(mut, address = global_config.platform_treasury)]
    pub platform_treasury: Box<Account<'info, TokenAccount>>,

    #[account(mut, address = market.creator_fee_account)]
    pub creator_fee_account: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(seeds = [b"allowed-mint", collateral_mint.key().as_ref()], bump)]
    pub allowed_mint: Account<'info, AllowedMint>,

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
