import BN from 'bn.js';

const BPS = new BN(10000);

/** Same as on-chain: market override if non-zero, else global. */
export function effectiveDepositPlatformFeeBps(
  marketOverride: number,
  globalBps: number
): number {
  return marketOverride > 0 ? marketOverride : globalBps;
}

/** `floor(amount * bps / 10000)`; 0 if bps > 10000. */
export function feeAmountFloor(amount: BN, bps: number): BN {
  if (bps > 10000) return new BN(0);
  return amount.mul(new BN(bps)).div(BPS);
}

export type StakeDepositFeePreview = {
  gross: BN;
  platformFee: BN;
  creatorFee: BN;
  netToPool: BN;
  effectivePlatformBps: number;
};

/**
 * Matches `parimutuel_stake` / `mint_complete_set`: fees are taken on `netToPool`;
 * user pays `gross = netToPool + platformFee + creatorFee`.
 */
export function previewParimutuelStakeDeposit(
  netToPool: BN,
  marketDepositPlatformFeeBps: number,
  globalDepositPlatformFeeBps: number,
  creatorFeeBps: number
): StakeDepositFeePreview | null {
  if (netToPool.lte(new BN(0))) return null;
  const effectivePlatformBps = effectiveDepositPlatformFeeBps(
    marketDepositPlatformFeeBps,
    globalDepositPlatformFeeBps
  );
  const platformFee = feeAmountFloor(netToPool, effectivePlatformBps);
  const creatorFee = feeAmountFloor(netToPool, creatorFeeBps);
  const gross = netToPool.add(platformFee).add(creatorFee);
  return {
    gross,
    platformFee,
    creatorFee,
    netToPool,
    effectivePlatformBps,
  };
}
