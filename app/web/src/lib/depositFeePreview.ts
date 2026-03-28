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

/** Matches `parimutuel_stake`: fees from gross, `net` to pool and position. */
export function previewParimutuelStakeDeposit(
  gross: BN,
  marketDepositPlatformFeeBps: number,
  globalDepositPlatformFeeBps: number,
  creatorFeeBps: number
): StakeDepositFeePreview | null {
  if (gross.lte(new BN(0))) return null;
  const effectivePlatformBps = effectiveDepositPlatformFeeBps(
    marketDepositPlatformFeeBps,
    globalDepositPlatformFeeBps
  );
  const platformFee = feeAmountFloor(gross, effectivePlatformBps);
  const creatorFee = feeAmountFloor(gross, creatorFeeBps);
  const netToPool = gross.sub(platformFee).sub(creatorFee);
  if (netToPool.isNeg()) return null;
  return {
    gross,
    platformFee,
    creatorFee,
    netToPool,
    effectivePlatformBps,
  };
}

/**
 * Smallest gross `G` such that net to pool (after platform + creator fees on `G`) is >= `desiredNet`.
 * Matches on-chain `parimutuel_stake` rounding (`fee_amount_floor` on gross).
 */
export function grossForDesiredNetToPool(
  desiredNet: BN,
  marketDepositPlatformFeeBps: number,
  globalDepositPlatformFeeBps: number,
  creatorFeeBps: number
): StakeDepositFeePreview | null {
  if (desiredNet.lte(new BN(0))) return null;
  const effectivePlatformBps = effectiveDepositPlatformFeeBps(
    marketDepositPlatformFeeBps,
    globalDepositPlatformFeeBps
  );
  if (effectivePlatformBps + creatorFeeBps >= 10000) return null;

  const netForGross = (g: BN): BN | null => {
    const p = previewParimutuelStakeDeposit(
      g,
      marketDepositPlatformFeeBps,
      globalDepositPlatformFeeBps,
      creatorFeeBps
    );
    return p?.netToPool ?? null;
  };

  let hi = desiredNet;
  let guard = 0;
  const maxExpand = 96;
  while (guard < maxExpand) {
    const n = netForGross(hi);
    if (n !== null && n.gte(desiredNet)) break;
    hi = hi.mul(new BN(2)).add(new BN(1));
    guard++;
  }
  const hiNet = netForGross(hi);
  if (hiNet === null || hiNet.lt(desiredNet)) return null;

  let lo = desiredNet;
  while (lo.lt(hi)) {
    const mid = lo.add(hi).shrn(1);
    const nmid = netForGross(mid);
    if (nmid !== null && nmid.gte(desiredNet)) {
      hi = mid;
    } else {
      lo = mid.add(new BN(1));
    }
  }

  return previewParimutuelStakeDeposit(
    lo,
    marketDepositPlatformFeeBps,
    globalDepositPlatformFeeBps,
    creatorFeeBps
  );
}
