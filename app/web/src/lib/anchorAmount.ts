import BN from 'bn.js';

/** Normalize Anchor `u64` / BN / BN-like account fields to `BN`. */
export function bnFromAnchor(v: unknown): BN {
  if (v == null || v === undefined) return new BN(0);
  if (BN.isBN(v)) return v as BN;
  if (typeof v === 'bigint') return new BN(v.toString());
  if (typeof v === 'number' && Number.isFinite(v)) return new BN(Math.trunc(v));
  try {
    const s = (v as { toString?: () => string }).toString?.();
    if (s !== undefined && s !== '') return new BN(s, 10);
  } catch {
    /* fall through */
  }
  return new BN(0);
}
