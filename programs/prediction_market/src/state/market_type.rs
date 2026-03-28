#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

/// How participation and settlement work for this market.
#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default,
)]
#[repr(u8)]
pub enum MarketType {
    /// SPL outcome tokens + complete-set mint/redeem (default).
    #[default]
    CompleteSet = 0,
    /// Ledger-only stakes; pro-rata pool payout after resolution.
    Parimutuel = 1,
}
