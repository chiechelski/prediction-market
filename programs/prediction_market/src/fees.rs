//! Pure fee math shared by **mint complete set**, **pari-mutuel stake**, and **pari-mutuel withdraw** previews.
//! Matches on-chain rounding: `floor(amount * bps / 10000)` per fee leg.
//!
//! Use these for UI / SDK previews; on-chain instructions use the same formulas via [`crate::state::Market`] and withdraw handlers.

/// Effective deposit platform bps: per-market override if non-zero, else global default.
#[inline]
pub fn effective_deposit_platform_fee_bps(market_override: u16, global_bps: u16) -> u16 {
    if market_override > 0 {
        market_override
    } else {
        global_bps
    }
}

/// `floor(amount * bps / 10000)`. Returns `0` if `bps > 10000` (same as [`crate::state::Market`] helpers).
#[inline]
pub fn fee_amount_floor(amount: u64, bps: u16) -> u64 {
    if bps > 10000 {
        return 0;
    }
    (amount as u128 * bps as u128 / 10000) as u64
}

/// Collateral split for a **deposit** (mint complete set or pari stake): fees taken from `gross`, remainder to vault.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DepositFeePreview {
    pub gross: u64,
    pub platform_fee: u64,
    pub creator_fee: u64,
    /// Net collateral credited to the vault / pool after both token fees.
    pub net_to_vault: u64,
}

/// Preview deposit fees given **effective** platform bps (after global vs market resolution).
pub fn preview_deposit_fees(
    gross: u64,
    deposit_platform_bps_effective: u16,
    creator_fee_bps: u16,
) -> Option<DepositFeePreview> {
    let platform_fee = fee_amount_floor(gross, deposit_platform_bps_effective);
    let creator_fee = fee_amount_floor(gross, creator_fee_bps);
    let net_to_vault = gross
        .checked_sub(platform_fee)?
        .checked_sub(creator_fee)?;
    Some(DepositFeePreview {
        gross,
        platform_fee,
        creator_fee,
        net_to_vault,
    })
}

/// Preview using market override + global default for platform bps (same rule as on-chain).
pub fn preview_deposit_fees_with_market(
    gross: u64,
    market_deposit_platform_fee_bps: u16,
    global_deposit_platform_fee_bps: u16,
    creator_fee_bps: u16,
) -> Option<DepositFeePreview> {
    let platform_bps = effective_deposit_platform_fee_bps(
        market_deposit_platform_fee_bps,
        global_deposit_platform_fee_bps,
    );
    preview_deposit_fees(gross, platform_bps, creator_fee_bps)
}

/// Full early-withdraw breakdown for pari-mutuel (matches [`crate::parimutuel_withdraw`]).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ParimutuelWithdrawFeePreview {
    pub gross_withdraw: u64,
    pub penalty: u64,
    /// `gross_withdraw - penalty`
    pub refund_before_withdraw_fee: u64,
    pub pool_keep: u64,
    pub penalty_surplus: u64,
    pub protocol_cut: u64,
    pub creator_cut: u64,
    pub withdraw_platform_fee_raw: u64,
    /// `min(withdraw_platform_fee_raw, refund_before_withdraw_fee)`
    pub withdraw_platform_fee: u64,
    pub user_refund: u64,
}

pub fn preview_parimutuel_early_withdraw(
    gross_amount: u64,
    early_withdraw_penalty_bps: u16,
    penalty_kept_in_pool_bps: u16,
    penalty_surplus_protocol_share_bps: u16,
    parimutuel_withdraw_platform_fee_bps: u16,
) -> Option<ParimutuelWithdrawFeePreview> {
    let penalty = (gross_amount as u128)
        .checked_mul(early_withdraw_penalty_bps as u128)?
        .checked_div(10000)? as u64;
    let refund = gross_amount.checked_sub(penalty)?;
    let pool_keep = (penalty as u128)
        .checked_mul(penalty_kept_in_pool_bps as u128)?
        .checked_div(10000)? as u64;
    let penalty_surplus = penalty.checked_sub(pool_keep)?;
    let protocol_cut = (penalty_surplus as u128)
        .checked_mul(penalty_surplus_protocol_share_bps as u128)?
        .checked_div(10000)? as u64;
    let creator_cut = penalty_surplus.checked_sub(protocol_cut)?;
    let withdraw_platform_fee_raw = (gross_amount as u128)
        .checked_mul(parimutuel_withdraw_platform_fee_bps as u128)?
        .checked_div(10000)? as u64;
    let withdraw_platform_fee = withdraw_platform_fee_raw.min(refund);
    let user_refund = refund.checked_sub(withdraw_platform_fee)?;
    Some(ParimutuelWithdrawFeePreview {
        gross_withdraw: gross_amount,
        penalty,
        refund_before_withdraw_fee: refund,
        pool_keep,
        penalty_surplus,
        protocol_cut,
        creator_cut,
        withdraw_platform_fee_raw,
        withdraw_platform_fee,
        user_refund,
    })
}

/// Smallest `gross` such that [`preview_deposit_fees`] yields `net_to_vault >= target_net`.
/// Returns `None` when combined fee bps ≥ 10000 (net cannot grow without bound).
pub fn gross_for_at_least_net_deposit(
    target_net: u64,
    deposit_platform_bps_effective: u16,
    creator_fee_bps: u16,
) -> Option<u64> {
    if target_net == 0 {
        return Some(0);
    }
    let total_fee_bps = deposit_platform_bps_effective as u32 + creator_fee_bps as u32;
    if total_fee_bps >= 10000 {
        return None;
    }
    let mut hi = target_net.max(1);
    while preview_deposit_fees(hi, deposit_platform_bps_effective, creator_fee_bps)?.net_to_vault
        < target_net
    {
        hi = hi.checked_mul(2)?;
    }
    let mut lo = 1u64;
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        let net = preview_deposit_fees(mid, deposit_platform_bps_effective, creator_fee_bps)?
            .net_to_vault;
        if net < target_net {
            lo = mid.saturating_add(1);
        } else {
            hi = mid;
        }
    }
    Some(lo)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deposit_one_percent_platform_half_percent_creator() {
        let p = preview_deposit_fees(1_000_000, 100, 50).unwrap();
        assert_eq!(p.platform_fee, 10_000);
        assert_eq!(p.creator_fee, 5_000);
        assert_eq!(p.net_to_vault, 985_000);
    }

    #[test]
    fn deposit_market_override_zero_uses_global() {
        let p = preview_deposit_fees_with_market(1_000_000, 0, 200, 0).unwrap();
        assert_eq!(p.platform_fee, 20_000);
        assert_eq!(p.net_to_vault, 980_000);
    }

    #[test]
    fn deposit_small_amount_rounds_down() {
        let p = preview_deposit_fees(99, 100, 100).unwrap();
        assert_eq!(p.platform_fee, 0);
        assert_eq!(p.creator_fee, 0);
        assert_eq!(p.net_to_vault, 99);
    }

    #[test]
    fn withdraw_penalty_and_withdraw_platform_fee() {
        // 400k withdraw, 5% penalty => 20k penalty, 380k refund; 1% of gross withdraw => 4k platform from refund
        let w = preview_parimutuel_early_withdraw(
            400_000,
            500,
            8000,
            2000,
            100,
        )
        .unwrap();
        assert_eq!(w.penalty, 20_000);
        assert_eq!(w.refund_before_withdraw_fee, 380_000);
        assert_eq!(w.withdraw_platform_fee_raw, 4_000);
        assert_eq!(w.withdraw_platform_fee, 4_000);
        assert_eq!(w.user_refund, 376_000);
        assert_eq!(w.pool_keep, 16_000);
        assert_eq!(w.penalty_surplus, 4_000);
        assert_eq!(w.protocol_cut, 800);
        assert_eq!(w.creator_cut, 3_200);
    }

    #[test]
    fn withdraw_platform_fee_capped_by_refund() {
        // Refund tiny; raw platform fee larger than refund
        let w = preview_parimutuel_early_withdraw(100, 9900, 8000, 5000, 5000).unwrap();
        assert_eq!(w.penalty, 99);
        assert_eq!(w.refund_before_withdraw_fee, 1);
        assert_eq!(w.withdraw_platform_fee_raw, 50);
        assert_eq!(w.withdraw_platform_fee, 1);
        assert_eq!(w.user_refund, 0);
    }

    #[test]
    fn gross_for_at_least_net_round_trip() {
        let target = 985_000u64;
        let g = gross_for_at_least_net_deposit(target, 100, 50).unwrap();
        let p = preview_deposit_fees(g, 100, 50).unwrap();
        assert!(p.net_to_vault >= target);
        if g > 0 {
            let p_prev = preview_deposit_fees(g - 1, 100, 50).unwrap();
            assert!(p_prev.net_to_vault < target);
        }
    }

    #[test]
    fn gross_for_at_least_net_impossible_when_fees_full() {
        assert!(gross_for_at_least_net_deposit(1, 5000, 5000).is_none());
    }
}
