#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub const PARIMUTUEL_STATE_ACCOUNT_SPACE_PADDING: usize = 64;

/// PDA seeds: `[b"pari", market.key()]`.
#[account]
#[derive(InitSpace)]
pub struct ParimutuelState {
    pub market: Pubkey,
    /// Sum of `outcome_pools` (must stay in sync).
    pub total_pool: u64,
    /// Collateral per outcome bucket; index `i < outcome_count` is used.
    pub outcome_pools: [u64; 8],
    /// Basis points of the **withdrawn amount** withheld as penalty (before refund). Example: 500 = 5%.
    pub early_withdraw_penalty_bps: u16,
    /// Of that withheld penalty, basis points (of 10000) that **remain in the same outcome pool**.
    /// The rest is **penalty surplus** split between protocol and creator per the two fields below.
    pub penalty_kept_in_pool_bps: u16,
    /// Snapshot at pool init: share of **penalty surplus** (after pool keeps its slice) to protocol.
    pub penalty_surplus_protocol_share_bps: u16,
    /// Snapshot at pool init: share of penalty surplus to the market creator (`creator_fee_account`).
    /// Must satisfy `penalty_surplus_protocol_share_bps + penalty_surplus_creator_share_bps == 10000`.
    pub penalty_surplus_creator_share_bps: u16,
    pub bump: u8,
    /// Snapshot at first claim after resolution (lazy); frozen payout math.
    pub resolved_total_pool: Option<u64>,
    pub resolved_winning_outcome_pool: Option<u64>,
    pub _padding: [u8; PARIMUTUEL_STATE_ACCOUNT_SPACE_PADDING],
}

impl ParimutuelState {
    pub const LEN: usize = 8 + ParimutuelState::INIT_SPACE;
}
