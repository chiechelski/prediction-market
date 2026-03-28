import BN from 'bn.js';

const BPS = new BN(10000);

/**
 * Matches `parimutuel_withdraw` collateral credited to the user ATA (`user_refund`),
 * before the flat SOL `platform_fee_lamports` transfer.
 */
export function parimutuelUserRefundPreview(
  grossAmount: BN,
  earlyWithdrawPenaltyBps: number,
  withdrawPlatformFeeBps: number
): { penalty: BN; refund: BN; withdrawPlatformFee: BN; userRefund: BN } {
  const penB = new BN(earlyWithdrawPenaltyBps);
  const wB = new BN(withdrawPlatformFeeBps);
  const penalty = grossAmount.mul(penB).div(BPS);
  const refund = grossAmount.sub(penalty);
  const withdrawPfRaw = grossAmount.mul(wB).div(BPS);
  const withdrawPf = withdrawPfRaw.gt(refund) ? refund : withdrawPfRaw;
  const userRefund = refund.sub(withdrawPf);
  return {
    penalty,
    refund,
    withdrawPlatformFee: withdrawPf,
    userRefund,
  };
}

/** Human-readable token amount from raw base units (matches on-chain decimals). */
export function formatRawCollateralAmount(raw: BN, decimals: number): string {
  if (decimals <= 0) return raw.toString(10);
  const divisor = new BN(10).pow(new BN(decimals));
  const whole = raw.div(divisor);
  const frac = raw.mod(divisor);
  const fracStr = frac
    .toString(10)
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return fracStr ? `${whole.toString(10)}.${fracStr}` : whole.toString(10);
}
