import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getMetadataPointerState,
  getMint,
  getTokenMetadata,
} from '@solana/spl-token';
import { PublicKey, type Connection } from '@solana/web3.js';
import { getKnownToken, mintToHue, type KnownToken } from './knownTokens';

export type CollateralTokenDisplay = {
  /** Short ticker (e.g. "USDC"). */
  symbol: string | null;
  /** Long name (e.g. "USD Coin"). */
  name: string | null;
  /** Which SPL program owns the mint account. */
  tokenProgram: 'spl-token' | 'token-2022';
  /** Hex colour to use for the logo circle. */
  color: string | null;
  /** Character(s) shown inside the logo circle. */
  logoChar: string | null;
  /** True when this data came from the static registry (no RPC needed). */
  fromRegistry: boolean;
};

/** Module-level cache so multiple component renders share one fetch. */
const _cache = new Map<string, CollateralTokenDisplay>();

function normalizeMint(mint: PublicKey | string): PublicKey {
  return mint instanceof PublicKey ? mint : new PublicKey(mint);
}

function knownTokenToDisplay(k: KnownToken): CollateralTokenDisplay {
  const tokenProgram = k.tokenProgram ?? 'spl-token';
  return {
    symbol: k.symbol,
    name: k.name,
    tokenProgram,
    color: k.color,
    logoChar: k.logoChar ?? k.symbol.charAt(0),
    fromRegistry: true,
  };
}

/**
 * Label shown next to amounts.
 * Priority: symbol → short name → SOL (9 dec) → mint fingerprint.
 */
export function formatCollateralUnitLabel(
  mint: PublicKey,
  display: CollateralTokenDisplay | null,
  collateralDecimals: number
): string {
  const sym = display?.symbol?.trim();
  if (sym) return sym;
  const name = display?.name?.trim();
  if (name) {
    return name.length > 14 ? `${name.slice(0, 12)}…` : name;
  }
  if (collateralDecimals === 9) return 'SOL';
  const s = mint.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/**
 * Hex colour for the logo circle.
 * Known tokens use their brand colour; others get a deterministic hue.
 */
export function collateralColor(
  mint: PublicKey,
  display: CollateralTokenDisplay | null
): string {
  if (display?.color) return display.color;
  if (display?.tokenProgram === 'token-2022') return '#0d9488'; // teal fallback
  const hue = mintToHue(mint.toBase58());
  return `hsl(${hue} 55% 45%)`;
}

/**
 * Best-effort human-readable collateral info.
 *
 * 1. Checks the static KNOWN_TOKENS registry first (synchronous, no RPC).
 * 2. If found → returns immediately (cached).
 * 3. If not found → fetches Token-2022 on-chain metadata (async, RPC).
 * 4. Caches everything so subsequent renders are instant.
 */
export async function fetchCollateralTokenDisplay(
  connection: Connection,
  mint: PublicKey | string
): Promise<CollateralTokenDisplay> {
  const mintPk = normalizeMint(mint);
  const key = mintPk.toBase58();

  if (_cache.has(key)) return _cache.get(key)!;

  // 1. Static registry (synchronous, no RPC)
  const known = getKnownToken(key);
  if (known) {
    const d = knownTokenToDisplay(known);
    _cache.set(key, d);
    return d;
  }

  // 2. On-chain Token-2022 metadata
  const info = await connection.getAccountInfo(mintPk);

  if (!info) {
    const d: CollateralTokenDisplay = {
      symbol: null,
      name: null,
      tokenProgram: 'spl-token',
      color: null,
      logoChar: null,
      fromRegistry: false,
    };
    _cache.set(key, d);
    return d;
  }

  if (!info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    const d: CollateralTokenDisplay = {
      symbol: null,
      name: null,
      tokenProgram: 'spl-token',
      color: null,
      logoChar: null,
      fromRegistry: false,
    };
    _cache.set(key, d);
    return d;
  }

  try {
    const mintState = await getMint(
      connection,
      mintPk,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );

    let meta = await getTokenMetadata(
      connection,
      mintPk,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );

    if (!meta) {
      const ptr = getMetadataPointerState(mintState);
      const alt = ptr?.metadataAddress;
      if (alt && !alt.equals(PublicKey.default) && !alt.equals(mintPk)) {
        try {
          meta = await getTokenMetadata(
            connection,
            alt,
            'confirmed',
            TOKEN_2022_PROGRAM_ID
          );
        } catch {
          /* metadata account may not use mint layout */
        }
      }
    }

    if (meta) {
      const symbol = meta.symbol?.trim() || null;
      const name = meta.name?.trim() || null;
      const d: CollateralTokenDisplay = {
        symbol,
        name,
        tokenProgram: 'token-2022',
        color: null,
        logoChar: symbol?.charAt(0) ?? name?.charAt(0) ?? null,
        fromRegistry: false,
      };
      _cache.set(key, d);
      return d;
    }
  } catch {
    // Missing extension or fetch error
  }

  const d: CollateralTokenDisplay = {
    symbol: null,
    name: null,
    tokenProgram: 'token-2022',
    color: null,
    logoChar: null,
    fromRegistry: false,
  };
  _cache.set(key, d);
  return d;
}

/** Clear the module cache (useful in tests). */
export function clearCollateralTokenCache() {
  _cache.clear();
}

export { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID };
