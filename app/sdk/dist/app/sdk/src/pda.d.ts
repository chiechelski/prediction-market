import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
/** Derive the GlobalConfig PDA. */
export declare const deriveGlobalConfig: (programId: PublicKey) => PublicKey;
/** Derive the AllowedMint PDA for a given collateral mint. */
export declare const deriveAllowedMint: (programId: PublicKey, mint: PublicKey) => PublicKey;
/** Derive the Market PDA for a given creator + market ID. */
export declare const deriveMarket: (programId: PublicKey, creator: PublicKey, marketId: BN) => PublicKey;
/** Derive the collateral vault PDA for a market. */
export declare const deriveVault: (programId: PublicKey, market: PublicKey) => PublicKey;
/** Derive the outcome mint PDA for a market and outcome index (0–7). */
export declare const deriveOutcomeMint: (programId: PublicKey, market: PublicKey, index: number) => PublicKey;
/** Derive all 8 outcome mint PDAs for a market. */
export declare const deriveAllOutcomeMints: (programId: PublicKey, market: PublicKey) => PublicKey[];
/** Derive the Resolver PDA for a market and resolver index (0–7). */
export declare const deriveResolver: (programId: PublicKey, market: PublicKey, index: number) => PublicKey;
/** Derive all 8 resolver PDAs for a market. */
export declare const deriveAllResolvers: (programId: PublicKey, market: PublicKey) => PublicKey[];
/** Derive the ResolutionVote PDA for a market and resolver index (0–7). */
export declare const deriveResolutionVote: (programId: PublicKey, market: PublicKey, resolverIndex: number) => PublicKey;
//# sourceMappingURL=pda.d.ts.map