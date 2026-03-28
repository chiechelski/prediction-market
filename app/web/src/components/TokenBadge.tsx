/**
 * TokenBadge — visual chip that shows a token's identity:
 *   • a coloured circle avatar (logo-char inside, or first letter of symbol)
 *   • the token symbol / short name beside it
 *
 * Variants:
 *   "inline"  – small dot + bold symbol, flows inline in text.
 *   "chip"    – pill-shaped container for the right side of inputs.
 *   "heading" – slightly larger, used next to big number headings.
 */

import type { PublicKey } from '@solana/web3.js';
import {
  collateralColor,
  formatCollateralUnitLabel,
  type CollateralTokenDisplay,
} from '@/lib/collateralTokenInfo';
import { mintToHue } from '@/lib/knownTokens';

type Props = {
  mint: PublicKey | null;
  display: CollateralTokenDisplay | null;
  decimals: number;
  variant?: 'inline' | 'chip' | 'heading';
  className?: string;
};

/** A small circular logo for the token. */
function TokenLogo({
  mint,
  display,
  size,
}: {
  mint: PublicKey;
  display: CollateralTokenDisplay | null;
  size: number;
}) {
  const bg = collateralColor(mint, display);
  const char = display?.logoChar ?? display?.symbol?.charAt(0) ?? display?.name?.charAt(0);

  if (!char) {
    // Unknown token — show a hash-tinted question-mark
    const hue = mintToHue(mint.toBase58());
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `hsl(${hue} 45% 35%)`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: Math.floor(size * 0.55),
          fontWeight: 800,
          color: 'rgba(255,255,255,0.85)',
          lineHeight: 1,
        }}
      >
        ?
      </span>
    );
  }

  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: Math.floor(size * 0.52),
        fontWeight: 800,
        color: 'rgba(255,255,255,0.95)',
        lineHeight: 1,
        letterSpacing: '-0.04em',
        userSelect: 'none',
      }}
    >
      {char}
    </span>
  );
}

export default function TokenBadge({
  mint,
  display,
  decimals,
  variant = 'inline',
  className = '',
}: Props) {
  if (!mint) {
    return <span className={className}>…</span>;
  }

  const label = formatCollateralUnitLabel(mint, display, decimals);

  if (variant === 'chip') {
    return (
      <span
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container-high px-2.5 py-1.5 text-xs font-bold text-on-surface ${className}`}
      >
        <TokenLogo mint={mint} display={display} size={16} />
        {label}
      </span>
    );
  }

  if (variant === 'heading') {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <TokenLogo mint={mint} display={display} size={22} />
        <span className="text-xl font-bold text-on-surface">{label}</span>
      </span>
    );
  }

  // inline
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <TokenLogo mint={mint} display={display} size={13} />
      <span className="font-bold">{label}</span>
    </span>
  );
}
