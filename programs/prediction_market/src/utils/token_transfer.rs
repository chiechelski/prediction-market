use anchor_lang::prelude::*;
use anchor_spl::token::{self, TransferChecked as SplTransferChecked};
use anchor_spl::token_2022::{self, TransferChecked as Token2022TransferChecked, ID as TOKEN_2022_PROGRAM_ID};
use anchor_spl::token_interface::{Mint, TokenInterface};

/// Transfer tokens (SPL or Token-2022) via transfer_checked.
/// `amount` is in token base units (already adjusted for decimals).
pub fn transfer_checked<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    if token_program.key() == TOKEN_2022_PROGRAM_ID {
        let cpi_accounts = Token2022TransferChecked {
            from: from.clone(),
            mint: mint.to_account_info(),
            to: to.clone(),
            authority: authority.clone(),
        };
        let cpi_ctx = if signer_seeds.is_empty() {
            CpiContext::new(token_program.to_account_info(), cpi_accounts)
        } else {
            CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signer_seeds)
        };
        token_2022::transfer_checked(cpi_ctx, amount, decimals)?;
    } else {
        let cpi_accounts = SplTransferChecked {
            from: from.clone(),
            mint: mint.to_account_info(),
            to: to.clone(),
            authority: authority.clone(),
        };
        let cpi_ctx = if signer_seeds.is_empty() {
            CpiContext::new(token_program.to_account_info(), cpi_accounts)
        } else {
            CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signer_seeds)
        };
        token::transfer_checked(cpi_ctx, amount, decimals)?;
    }
    Ok(())
}
