#![allow(clippy::result_large_err)]

use crate::errors::PredictionMarketError;
use crate::state::*;
use crate::utils::transfer_checked;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::system_program::{self, Transfer as SolTransfer};
use anchor_spl::token::{self, MintTo, Token, TokenAccount};
use anchor_spl::token::spl_token::state::{Account as SplTokenAccount, Mint as SplMint};
use anchor_spl::token_interface::TokenInterface;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct MintCompleteSetArgs {
    pub amount: u64,
    pub market_id: u64,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, MintCompleteSet<'info>>,
    args: MintCompleteSetArgs,
) -> Result<()> {
    let clock = Clock::get()?;
    let market = &ctx.accounts.market;
    require!(!market.is_closed(&clock), PredictionMarketError::MarketClosed);
    require!(!market.voided, PredictionMarketError::MarketVoided);
    require!(args.amount > 0, PredictionMarketError::ZeroMintAmount);

    require!(
        ctx.accounts.platform_treasury_wallet.key() == ctx.accounts.global_config.platform_treasury,
        PredictionMarketError::ConfigUnauthorized
    );
    require!(
        ctx.accounts.platform_treasury_wallet.to_account_info().owner == &system_program::ID,
        PredictionMarketError::ConfigUnauthorized
    );
    let treasury_ata = &ctx.accounts.platform_treasury_ata;
    require!(
        treasury_ata.mint == ctx.accounts.collateral_mint.key(),
        PredictionMarketError::InvalidTreasuryAta
    );
    require!(
        treasury_ata.owner == ctx.accounts.platform_treasury_wallet.key(),
        PredictionMarketError::InvalidTreasuryAta
    );
    require!(
        treasury_ata.to_account_info().owner == &ctx.accounts.collateral_token_program.key(),
        PredictionMarketError::InvalidTreasuryAta
    );

    let global_config = &ctx.accounts.global_config;
    let global_bps = global_config.platform_fee_bps;
    let platform_fee = market.calculate_platform_fee(args.amount, global_bps);
    let creator_fee = market.calculate_creator_fee(args.amount);
    let net = args
        .amount
        .checked_sub(platform_fee)
        .and_then(|n| n.checked_sub(creator_fee))
        .ok_or(PredictionMarketError::InvalidFeeBps)?;

    // Flat SOL fee to platform treasury wallet
    let fee_lamports = global_config.platform_fee_lamports;
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
            &ctx.accounts.platform_treasury_ata.to_account_info(),
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
    let rem = ctx.remaining_accounts;
    require!(
        rem.len() == 2 * outcome_count,
        PredictionMarketError::InvalidMintCompleteSetRemainingAccounts
    );

    let token_prog = ctx.accounts.token_program.key();
    for i in 0..outcome_count {
        let mint_ai = &rem[2 * i];
        let dest_ai = &rem[2 * i + 1];

        let (expected_mint, _) = Pubkey::find_program_address(
            &[
                market.key().as_ref(),
                b"outcome-mint",
                &[i as u8],
            ],
            ctx.program_id,
        );
        require_keys_eq!(mint_ai.key(), expected_mint);
        require_keys_eq!(*mint_ai.owner, token_prog);

        {
            let mint_data = mint_ai.try_borrow_data()?;
            let mint_state = SplMint::unpack(&mint_data)
                .map_err(|_| error!(PredictionMarketError::InvalidMintCompleteSetRemainingAccounts))?;
            let auth = match mint_state.mint_authority {
                COption::Some(a) => a,
                COption::None => {
                    return Err(error!(PredictionMarketError::InvalidMintCompleteSetRemainingAccounts));
                }
            };
            require_keys_eq!(auth, market.key());
        } // mint_data borrow released here — must happen before mint_to CPI below

        require_keys_eq!(*dest_ai.owner, token_prog);
        {
            let dest_data = dest_ai.try_borrow_data()?;
            let dest_state = SplTokenAccount::unpack(&dest_data)
                .map_err(|_| error!(PredictionMarketError::InvalidMintCompleteSetRemainingAccounts))?;
            require_keys_eq!(dest_state.owner, ctx.accounts.user.key());
            require_keys_eq!(dest_state.mint, mint_ai.key());
        } // dest_data borrow released here — must happen before mint_to CPI below

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: rem[2 * i].clone(),
                    to: rem[2 * i + 1].clone(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                signer_seeds,
            ),
            net,
        )?;
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
    pub market: Box<Account<'info, Market>>,

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

    #[account(mut, address = market.creator_fee_account)]
    pub creator_fee_account: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    #[account(seeds = [b"allowed-mint", collateral_mint.key().as_ref()], bump)]
    pub allowed_mint: Box<Account<'info, AllowedMint>>,

    /// Wallet from global_config.platform_treasury (SOL + fee destination identity).
    #[account(mut, address = global_config.platform_treasury)]
    pub platform_treasury_wallet: SystemAccount<'info>,

    /// ATA for collateral mint; mint/owner validated in handler.
    #[account(mut)]
    pub platform_treasury_ata: Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,

    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
