import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

/** Derive the GlobalConfig PDA. */
export const deriveGlobalConfig = (programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from('global-config')], programId)[0];

/** Derive the AllowedMint PDA for a given collateral mint. */
export const deriveAllowedMint = (programId: PublicKey, mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('allowed-mint'), mint.toBuffer()],
    programId
  )[0];

/** Derive the Market PDA for a given creator + market ID. */
export const deriveMarket = (
  programId: PublicKey,
  creator: PublicKey,
  marketId: BN
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('market'), creator.toBuffer(), marketId.toArrayLike(Buffer, 'le', 8)],
    programId
  )[0];

/** Derive the collateral vault PDA for a market. */
export const deriveVault = (programId: PublicKey, market: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([market.toBuffer(), Buffer.from('vault')], programId)[0];

/** Derive the outcome mint PDA for a market and outcome index (0–7). */
export const deriveOutcomeMint = (
  programId: PublicKey,
  market: PublicKey,
  index: number
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('outcome-mint'), Buffer.from([index])],
    programId
  )[0];

/** Derive all 8 outcome mint PDAs for a market. */
export const deriveAllOutcomeMints = (programId: PublicKey, market: PublicKey): PublicKey[] =>
  Array.from({ length: 8 }, (_, i) => deriveOutcomeMint(programId, market, i));

/** Derive the Resolver PDA for a market and resolver index (0–7). */
export const deriveResolver = (
  programId: PublicKey,
  market: PublicKey,
  index: number
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('resolver'), Buffer.from([index])],
    programId
  )[0];

/** Derive all 8 resolver PDAs for a market. */
export const deriveAllResolvers = (programId: PublicKey, market: PublicKey): PublicKey[] =>
  Array.from({ length: 8 }, (_, i) => deriveResolver(programId, market, i));

/** Derive the ResolutionVote PDA for a market and resolver index (0–7). */
export const deriveResolutionVote = (
  programId: PublicKey,
  market: PublicKey,
  resolverIndex: number
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('vote'), Buffer.from([resolverIndex])],
    programId
  )[0];

/** Per-outcome resolution vote counter PDA (0–7). */
export const deriveOutcomeTally = (
  programId: PublicKey,
  market: PublicKey,
  outcomeIndex: number
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('outcome-tally'), Buffer.from([outcomeIndex])],
    programId
  )[0];

/** All eight outcome tally PDAs (unused outcome indices may never be initialized). */
export const deriveAllOutcomeTallies = (programId: PublicKey, market: PublicKey): PublicKey[] =>
  Array.from({ length: 8 }, (_, i) => deriveOutcomeTally(programId, market, i));

/** Derive the UserProfile PDA for a given wallet address. Seeds: ["user-profile", wallet]. */
export const deriveUserProfile = (programId: PublicKey, wallet: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('user-profile'), wallet.toBuffer()],
    programId
  )[0];

/** Market category PDA — seeds: `["market-category", category_id u64 LE]`. */
export const deriveMarketCategory = (programId: PublicKey, categoryId: BN): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('market-category'), categoryId.toArrayLike(Buffer, 'le', 8)],
    programId
  )[0];
