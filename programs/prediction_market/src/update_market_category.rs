#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<UpdateMarketCategory>, name: String, active: bool) -> Result<()> {
    require!(
        ctx.accounts
            .global_config
            .is_allowed_authority(ctx.accounts.authority.key()),
        PredictionMarketError::ConfigUnauthorized
    );
    let name = name.trim();
    require!(!name.is_empty(), PredictionMarketError::MarketCategoryNameEmpty);
    require!(
        name.len() <= MAX_MARKET_CATEGORY_NAME_LEN,
        PredictionMarketError::MarketCategoryNameTooLong
    );

    let cat = &mut ctx.accounts.market_category;
    cat.name = name.to_string();
    cat.active = active;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateMarketCategory<'info> {
    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"market-category".as_ref(), market_category.id.to_le_bytes().as_ref()],
        bump = market_category.bump,
    )]
    pub market_category: Account<'info, MarketCategory>,

    pub authority: Signer<'info>,
}
