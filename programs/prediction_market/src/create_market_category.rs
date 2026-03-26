#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<CreateMarketCategory>, category_id: u64, name: String) -> Result<()> {
    require!(
        ctx.accounts
            .global_config
            .is_allowed_authority(ctx.accounts.authority.key()),
        PredictionMarketError::ConfigUnauthorized
    );
    require!(
        category_id == ctx.accounts.global_config.next_category_id,
        PredictionMarketError::InvalidCategoryId
    );
    let name = name.trim();
    require!(!name.is_empty(), PredictionMarketError::MarketCategoryNameEmpty);
    require!(
        name.len() <= MAX_MARKET_CATEGORY_NAME_LEN,
        PredictionMarketError::MarketCategoryNameTooLong
    );

    let cat = &mut ctx.accounts.market_category;
    cat.id = category_id;
    cat.name = name.to_string();
    cat.active = true;
    cat.bump = ctx.bumps.market_category;
    cat._padding = [0u8; MARKET_CATEGORY_ACCOUNT_SPACE_PADDING];

    ctx.accounts.global_config.next_category_id = category_id
        .checked_add(1)
        .ok_or(PredictionMarketError::OutcomeTallyOverflow)?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(category_id: u64, name: String)]
pub struct CreateMarketCategory<'info> {
    #[account(mut, seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = authority,
        space = MarketCategory::LEN,
        seeds = [b"market-category".as_ref(), category_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub market_category: Account<'info, MarketCategory>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
