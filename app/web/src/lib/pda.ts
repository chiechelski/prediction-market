import { PublicKey } from '@solana/web3.js';
import type BN from 'bn.js';

export function deriveGlobalConfig(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global-config')],
    programId
  );
  return pda;
}

export function deriveMarket(
  programId: PublicKey,
  creator: PublicKey,
  marketId: BN
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('market'),
      creator.toBuffer(),
      marketId.toArrayLike(Buffer, 'le', 8),
    ],
    programId
  );
  return pda;
}

export function deriveVault(programId: PublicKey, market: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('vault')],
    programId
  );
  return pda;
}

export function deriveOutcomeMint(
  programId: PublicKey,
  market: PublicKey,
  index: number
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('outcome-mint'), Buffer.from([index])],
    programId
  );
  return pda;
}

export function deriveAllowedMint(
  programId: PublicKey,
  mint: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('allowed-mint'), mint.toBuffer()],
    programId
  );
  return pda;
}

export function deriveResolver(
  programId: PublicKey,
  market: PublicKey,
  index: number
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('resolver'), Buffer.from([index])],
    programId
  );
  return pda;
}

export function deriveResolutionVote(
  programId: PublicKey,
  market: PublicKey,
  resolverIndex: number
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('vote'), Buffer.from([resolverIndex])],
    programId
  );
  return pda;
}

export function deriveOutcomeTally(
  programId: PublicKey,
  market: PublicKey,
  outcomeIndex: number
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('outcome-tally'), Buffer.from([outcomeIndex])],
    programId
  );
  return pda;
}

export function deriveAllOutcomeTallies(
  programId: PublicKey,
  market: PublicKey
): PublicKey[] {
  return Array.from({ length: 8 }, (_, i) =>
    deriveOutcomeTally(programId, market, i)
  );
}

export function deriveAllOutcomeMints(
  programId: PublicKey,
  market: PublicKey
): PublicKey[] {
  return Array.from({ length: 8 }, (_, i) =>
    deriveOutcomeMint(programId, market, i)
  );
}

export function deriveAllResolvers(
  programId: PublicKey,
  market: PublicKey
): PublicKey[] {
  return Array.from({ length: 8 }, (_, i) =>
    deriveResolver(programId, market, i)
  );
}

export function deriveUserProfile(
  programId: PublicKey,
  wallet: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user-profile'), wallet.toBuffer()],
    programId
  );
  return pda;
}

/** PDA for `MarketCategory` — seeds: `["market-category", id LE u8×8]`. */
export function deriveMarketCategory(
  programId: PublicKey,
  categoryId: BN
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('market-category'), categoryId.toArrayLike(Buffer, 'le', 8)],
    programId
  );
  return pda;
}

export function deriveParimutuelState(
  programId: PublicKey,
  market: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pari'), market.toBuffer()],
    programId
  );
  return pda;
}

export function deriveParimutuelPosition(
  programId: PublicKey,
  market: PublicKey,
  user: PublicKey,
  outcomeIndex: number
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('pari-pos'),
      market.toBuffer(),
      user.toBuffer(),
      Buffer.from([outcomeIndex]),
    ],
    programId
  );
  return pda;
}
