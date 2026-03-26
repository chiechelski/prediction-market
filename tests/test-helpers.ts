import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

// ─── Pre-generated keypairs (deterministic addresses across runs) ───────────

export const collateralMintKeypair = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, './keys/collateral-mint.json')).toString()
    )
  )
);

export const resolverKeypair = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, './keys/resolver.json')).toString()
    )
  )
);

export const userKeypair = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, './keys/user.json')).toString()
    )
  )
);

export const COLLATERAL_DECIMALS = 6;

// ─── ATA helpers ─────────────────────────────────────────────────────────────

export const getAta = (mint: PublicKey, owner: PublicKey): PublicKey =>
  getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

// ─── PDA derivation helpers ──────────────────────────────────────────────────

export const deriveGlobalConfig = (programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from('global-config')], programId)[0];

export const deriveAllowedMint = (programId: PublicKey, mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('allowed-mint'), mint.toBuffer()],
    programId
  )[0];

export const deriveMarket = (
  programId: PublicKey,
  creator: PublicKey,
  marketId: anchor.BN
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('market'), creator.toBuffer(), marketId.toArrayLike(Buffer, 'le', 8)],
    programId
  )[0];

export const deriveVault = (programId: PublicKey, market: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([market.toBuffer(), Buffer.from('vault')], programId)[0];

export const deriveOutcomeMint = (
  programId: PublicKey,
  market: PublicKey,
  index: number
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('outcome-mint'), Buffer.from([index])],
    programId
  )[0];

export const deriveResolver = (
  programId: PublicKey,
  market: PublicKey,
  index: number
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [market.toBuffer(), Buffer.from('resolver'), Buffer.from([index])],
    programId
  )[0];

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

// ─── Market account helpers (all 8 PDAs at once) ────────────────────────────

export const deriveAllOutcomeMints = (programId: PublicKey, market: PublicKey): PublicKey[] =>
  Array.from({ length: 8 }, (_, i) => deriveOutcomeMint(programId, market, i));

export const deriveAllResolvers = (programId: PublicKey, market: PublicKey): PublicKey[] =>
  Array.from({ length: 8 }, (_, i) => deriveResolver(programId, market, i));

export const deriveAllOutcomeTallies = (programId: PublicKey, market: PublicKey): PublicKey[] =>
  Array.from({ length: 8 }, (_, i) => deriveOutcomeTally(programId, market, i));

/** Derive the UserProfile PDA for a given wallet. Seeds: ["user-profile", wallet]. */
export const deriveUserProfile = (programId: PublicKey, wallet: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('user-profile'), wallet.toBuffer()],
    programId
  )[0];

/** Market category PDA — seeds: `["market-category", id u64 LE]`. */
export const deriveMarketCategory = (
  programId: PublicKey,
  categoryId: anchor.BN
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('market-category'), categoryId.toArrayLike(Buffer, 'le', 8)],
    programId
  )[0];
