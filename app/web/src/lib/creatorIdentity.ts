import type { UserProfileData } from '@/lib/marketActions';

export function shortCreatorAddress(pk: string): string {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

/** On-chain profile name wins over local registry label from the create flow. */
export function resolveCreatorDisplayName(
  creatorPubkey: string,
  profile: UserProfileData | null | undefined,
  registryDisplayName?: string
): string {
  const fromChain = profile?.displayName?.trim();
  if (fromChain) return fromChain;
  const fromReg = registryDisplayName?.trim();
  if (fromReg) return fromReg;
  return shortCreatorAddress(creatorPubkey);
}
