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
    /// 0 = use global default — platform fee on **mint complete set** (deposit collateral).
    pub deposit_platform_fee_bps: u16,
    /// How many resolver PDAs to initialize (slots 0..num_resolvers-1) via `initialize_market_resolver`.
    pub num_resolvers: u8,
    /// UTF-8 market title (1–128 bytes after trim).
    pub title: String,
    /// [`MarketType::CompleteSet`] (SPL outcomes) or [`MarketType::Parimutuel`] (ledger pool).
    pub market_type: MarketType,
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
    let global_bps = ctx.accounts.global_config.deposit_platform_fee_bps;
    let effective_platform_bps = if args.deposit_platform_fee_bps > 0 {
        args.deposit_platform_fee_bps
    } else {
        global_bps
    };
    require!(
        effective_platform_bps + args.creator_fee_bps <= 10000,
        PredictionMarketError::InvalidFeeBps
    );

    let title = args.title.trim();
    require!(!title.is_empty(), PredictionMarketError::EmptyTitle);
    require!(
        title.len() <= crate::state::MAX_MARKET_TITLE_LEN,
        PredictionMarketError::TitleTooLong
    );

    let category_pk = if let Some(ref cat) = ctx.accounts.market_category.as_ref() {
        require!(cat.active, PredictionMarketError::MarketCategoryInactive);
        cat.key()
    } else {
        Pubkey::default()
    };

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
    market.num_resolvers = args.num_resolvers;
    market.creator = ctx.accounts.creator.key();
    market.creator_fee_bps = args.creator_fee_bps;
    market.creator_fee_account = ctx.accounts.creator_fee_account.key();
    market.deposit_platform_fee_bps = args.deposit_platform_fee_bps;
    market.bump = ctx.bumps.market;
    market.title = title.to_string();
    market.category = category_pk;
    market.market_type = args.market_type;
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

    /// Optional — omit account for uncategorized (`category = Pubkey::default()`).
    pub market_category: Option<Account<'info, MarketCategory>>,

    pub collateral_token_program: Interface<'info, TokenInterface>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}
