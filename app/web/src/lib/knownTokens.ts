/**
 * Static registry of well-known SPL/Token-2022 mint addresses.
 *
 * Add entries here so the UI shows a proper name, symbol, and branded colour
 * without making any RPC calls. The on-chain Token-2022 metadata fetch is only
 * attempted for mints that are NOT listed here.
 *
 * ─── How to add your local test mint ───────────────────────────────────────
 *   1. Run `yarn script:usdc` once — the mint address is printed at the end
 *      and saved to prediction_market/tests/keys/test-usdc-mint.json.
 *   2. Add an entry to LOCAL_TEST_TOKENS below with that address.
 * ────────────────────────────────────────────────────────────────────────────
 */

export type KnownToken = {
  symbol: string;
  name: string;
  decimals: number;
  /** Hex colour for the logo circle background (should be readable on dark UI). */
  color: string;
  /** Override the character(s) shown inside the circle. Defaults to first char of symbol. */
  logoChar?: string;
};

// ─── Mainnet tokens ──────────────────────────────────────────────────────────
const MAINNET_TOKENS: Record<string, KnownToken> = {
  // Circle USDC
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    color: '#2775CA',
    logoChar: '$',
  },
  // Tether USDT
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    color: '#26A17B',
    logoChar: '₮',
  },
  // Wrapped SOL
  So11111111111111111111111111111111111111112: {
    symbol: 'wSOL',
    name: 'Wrapped SOL',
    decimals: 9,
    color: '#9945FF',
    logoChar: '◎',
  },
  // PYUSD (PayPal USD)
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo': {
    symbol: 'PYUSD',
    name: 'PayPal USD',
    decimals: 6,
    color: '#003087',
    logoChar: 'P',
  },
};

// ─── Devnet tokens ────────────────────────────────────────────────────────────
const DEVNET_TOKENS: Record<string, KnownToken> = {
  // Circle USDC devnet
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': {
    symbol: 'USDC',
    name: 'USD Coin (Devnet)',
    decimals: 6,
    color: '#2775CA',
    logoChar: '$',
  },
};

// ─── Local / custom test tokens ───────────────────────────────────────────────
// The address below is the keypair saved in tests/keys/test-usdc-mint.json.
// If you reset the validator AND delete that file a new address will be
// generated — just replace the key here with the new address printed by
// `yarn script:usdc`.
const LOCAL_TEST_TOKENS: Record<string, KnownToken> = {
  '5FRiaWLHiYPiF8LSPHV5eaR2Ehy62V2Kh1SwUGRvd555': {
    symbol: 'tUSDC',
    name: 'Test USD Coin',
    decimals: 6,
    color: '#0d9488',
    logoChar: '$',
  },
};

// ─── Combined map (edit above, not here) ─────────────────────────────────────
export const KNOWN_TOKENS: Readonly<Record<string, KnownToken>> = {
  ...MAINNET_TOKENS,
  ...DEVNET_TOKENS,
  ...LOCAL_TEST_TOKENS,
};

/** Look up a mint address in the static registry. */
export function getKnownToken(mint: string): KnownToken | undefined {
  return KNOWN_TOKENS[mint];
}

/**
 * Deterministic hue from a base-58 string so every unknown mint always renders
 * the same colour.
 */
export function mintToHue(mint: string): number {
  let h = 0;
  for (let i = 0; i < mint.length; i++) {
    h = (h * 31 + mint.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}
