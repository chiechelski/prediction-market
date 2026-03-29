import type { UserProfileData } from '@/lib/marketActions';

export function shortCreatorAddress(pk: string): string {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

/** Uses on-chain user profile display name when present; otherwise shortened pubkey. */
export function resolveCreatorDisplayName(
  creatorPubkey: string,
  profile: UserProfileData | null | undefined
): string {
  const fromChain = profile?.displayName?.trim();
  if (fromChain) return fromChain;
  return shortCreatorAddress(creatorPubkey);
}
