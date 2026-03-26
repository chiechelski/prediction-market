#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use anchor_spl::token_interface::{Mint as InterfaceMint, TokenAccount, TokenInterface};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateMarketArgs {
    pub market_id: u64,
    pub outcome_count: u8,
    pub resolution_threshold: u8,
    pub close_at: i64,
    pub creator_fee_bps: u16,
    pub platform_fee_bps: u16,
    /// Up to 8 resolver pubkeys, set during initialize_market_resolvers.
    pub num_resolvers: u8,
}

pub fn handler(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        args.close_at > clock.unix_timestamp,
        PredictionMarketError::CloseAtMustBeInFuture
    );
    require!(
        args.outcome_count >= 2 && args.outcome_count <= 8,
        PredictionMarketError::InvalidOutcomeIndex
    );
    require!(
        args.num_resolvers <= 8
            && args.resolution_threshold >= 1
            && args.resolution_threshold <= args.num_resolvers,
        PredictionMarketError::InvalidResolutionThreshold
    );
    let global_bps = ctx.accounts.global_config.platform_fee_bps;
    let effective_platform_bps = if args.platform_fee_bps > 0 {
        args.platform_fee_bps
    } else {
        global_bps
    };
    require!(
        effective_platform_bps + args.creator_fee_bps <= 10000,
        PredictionMarketError::InvalidFeeBps
    );

    let market = &mut ctx.accounts.market;
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.collateral_decimals = ctx.accounts.collateral_mint.decimals;
    market.vault = ctx.accounts.vault.key();
    market.outcome_count = args.outcome_count;
    market.close_at = args.close_at;
    market.closed = false;
    market.resolved_outcome_index = None;
    market.voided = false;
    market.resolution_threshold = args.resolution_threshold;
    market.creator = ctx.accounts.creator.key();
    market.creator_fee_bps = args.creator_fee_bps;
    market.creator_fee_account = ctx.accounts.creator_fee_account.key();
    market.platform_fee_bps = args.platform_fee_bps;
    market.bump = ctx.bumps.market;
    market._padding = [0u8; MARKET_ACCOUNT_SPACE_PADDING];

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: CreateMarketArgs)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = Market::LEN,
        seeds = [b"market", creator.key().as_ref(), &args.market_id.to_le_bytes()],
        bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = payer,
        seeds = [market.key().as_ref(), b"vault"],
        bump,
        token::mint = collateral_mint,
        token::authority = market,
        token::token_program = collateral_token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub collateral_mint: InterfaceAccount<'info, InterfaceMint>,

    pub creator: Signer<'info>,

    /// CHECK: validated by client; must be a token account for collateral_mint
    pub creator_fee_account: UncheckedAccount<'info>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(seeds = [b"allowed-mint", collateral_mint.key().as_ref()], bump)]
    pub allowed_mint: Account<'info, AllowedMint>,

    pub collateral_token_program: Interface<'info, TokenInterface>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}
