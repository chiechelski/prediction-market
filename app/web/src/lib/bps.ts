/** 100 basis points = 1%. */
export function formatBpsAsPercent(bps: number): string {
  const n = Number(bps);
  if (!Number.isFinite(n)) return '—';
  const pct = n / 100;
  if (Number.isInteger(pct)) return `${pct}%`;
  const s = pct.toFixed(2).replace(/\.?0+$/, '');
  return `${s}%`;
}
