#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use crate::utils::transfer_checked;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer as SolTransfer};
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RedeemWinningArgs {
    pub market_id: u64,
    pub amount: u64,
}

pub fn handler(ctx: Context<RedeemWinning>, args: RedeemWinningArgs) -> Result<()> {
    let market = &ctx.accounts.market;
    require!(market.is_resolved(), PredictionMarketError::MarketNotResolved);
    require!(!market.voided, PredictionMarketError::MarketVoided);
    let winning_index = market
        .resolved_outcome_index
        .ok_or(PredictionMarketError::MarketNotResolved)?;
    require!(args.amount > 0, PredictionMarketError::ZeroMintAmount);

    // Flat SOL fee to platform treasury wallet
    let fee_lamports = ctx.accounts.global_config.platform_fee_lamports;
    if fee_lamports > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                SolTransfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.platform_treasury_wallet.to_account_info(),
                },
            ),
            fee_lamports,
        )?;
    }

    // 1 winning token base unit = 1 collateral base unit (both mints share the same decimals)
    let collateral_amount = args.amount;

    let user = ctx.accounts.user.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();

    let winning_mint = match winning_index {
        0 => &ctx.accounts.outcome_mint_0,
        1 => &ctx.accounts.outcome_mint_1,
        2 => &ctx.accounts.outcome_mint_2,
        3 => &ctx.accounts.outcome_mint_3,
        4 => &ctx.accounts.outcome_mint_4,
        5 => &ctx.accounts.outcome_mint_5,
        6 => &ctx.accounts.outcome_mint_6,
        7 => &ctx.accounts.outcome_mint_7,
        _ => return Err(PredictionMarketError::InvalidOutcomeIndex.into()),
    };
    let winning_source = &ctx.accounts.user_winning_outcome;
    require!(
        winning_source.mint == winning_mint.key(),
        PredictionMarketError::InvalidOutcomeIndex
    );

    let cpi_accounts = Burn {
        mint: winning_mint.to_account_info(),
        from: winning_source.to_account_info(),
        authority: user,
    };
    token::burn(CpiContext::new(token_program, cpi_accounts), args.amount)?;

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
        ctx.accounts.collateral_mint.decimals,
        &[market_seeds],
    )?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: RedeemWinningArgs)]
pub struct RedeemWinning<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.creator.as_ref(), &args.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

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

    #[account(
        mut,
        constraint = user_winning_outcome.owner == user.key(),
    )]
    pub user_winning_outcome: Account<'info, TokenAccount>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    /// Wallet address that receives the flat SOL fee.
    #[account(mut, address = global_config.platform_treasury)]
    pub platform_treasury_wallet: SystemAccount<'info>,

    pub collateral_token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
