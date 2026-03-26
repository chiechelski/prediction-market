import { PublicKey } from '@solana/web3.js';

/** `Pubkey::default()` on-chain means the market has no category PDA. */
export const UNCATEGORIZED_PUBKEY_STR = PublicKey.default.toBase58();

export function isUncategorizedPubkeyStr(pubkeyStr: string): boolean {
  return pubkeyStr === UNCATEGORIZED_PUBKEY_STR;
}

export function isUncategorizedPubkey(pk: PublicKey): boolean {
  return pk.equals(PublicKey.default);
}
