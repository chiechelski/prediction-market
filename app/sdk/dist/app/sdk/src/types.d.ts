import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
export interface CreateMarketParams {
    /** Unique u64 market identifier — must be unique per creator. */
    marketId: BN;
    /** Number of outcomes (2–8). */
    outcomeCount: number;
    /** Number of resolvers that must agree (1–numResolvers). */
    resolutionThreshold: number;
    /** Unix timestamp after which new minting is blocked. */
    closeAt: BN;
    /** Creator fee in basis points (0–10000). */
    creatorFeeBps: number;
    /**
     * Optional per-market platform fee on **mint complete set** (deposit) in bps.
     * Pass 0 to inherit the global config default (`depositPlatformFeeBps`).
     */
    depositPlatformFeeBps: number;
    /** Number of resolvers (1–8). */
    numResolvers: number;
    /** Market title (1–128 UTF-8 bytes). */
    title: string;
    /**
     * Optional category PDA — omit or pass `null` for uncategorized.
     * Must be an active `MarketCategory` account when set.
     */
    marketCategory?: PublicKey | null;
    /**
     * `completeSet` (default) — SPL outcome tokens + mint/redeem.
     * `parimutuel` — ledger stakes only; call `initializeParimutuelState` instead of mints.
     */
    marketType?: 'completeSet' | 'parimutuel';
    /**
     * When `marketType === 'parimutuel'`, optional overrides for pool init. Defaults are merged with
     * `penaltySurplusCreatorShareBps = 10000 - global.parimutuelPenaltyProtocolShareBps`.
     */
    parimutuelInit?: Partial<{
        earlyWithdrawPenaltyBps: number;
        penaltyKeptInPoolBps: number;
        penaltySurplusCreatorShareBps: number;
    }>;
}
/**
 * Anchor IDL enum shape for `createMarket` args (`MarketType`).
 * Use this so `tsc` matches `DecodeEnum` (each variant must be a single key).
 */
export type MarketTypeIx = {
    completeSet: Record<string, never>;
} | {
    parimutuel: Record<string, never>;
};
export declare function toMarketTypeIx(marketType: CreateMarketParams['marketType']): MarketTypeIx;
export interface InitializeMarketResolversParams {
    marketId: BN;
    /** Exactly 8 pubkeys; slots beyond numResolvers should be PublicKey.default. */
    resolverPubkeys: [
        PublicKey,
        PublicKey,
        PublicKey,
        PublicKey,
        PublicKey,
        PublicKey,
        PublicKey,
        PublicKey
    ];
    numResolvers: number;
}
/** Pari-mutuel pool account (after `createMarket` with `marketType: parimutuel`). */
export interface InitializeParimutuelStateParams {
    marketId: BN;
    /** Bps of the withdrawn stake withheld as penalty (before refund). */
    earlyWithdrawPenaltyBps: number;
    /** Of the withheld penalty, bps that stay in the outcome pool; the rest is surplus. */
    penaltyKeptInPoolBps: number;
    /**
     * Bps of penalty surplus to the market creator — must sum with
     * `globalConfig.parimutuelPenaltyProtocolShareBps` to 10000.
     */
    penaltySurplusCreatorShareBps: number;
}
export interface ParimutuelStakeParams {
    marketId: BN;
    outcomeIndex: number;
    amount: BN;
}
export interface ParimutuelWithdrawParams {
    marketId: BN;
    outcomeIndex: number;
    amount: BN;
}
export interface ParimutuelClaimParams {
    marketId: BN;
    outcomeIndex: number;
}
export interface MintCompleteSetParams {
    marketId: BN;
    /** Collateral amount in base units (e.g. 10_000_000 = 10 USDC with 6 decimals). */
    amount: BN;
}
export interface RedeemCompleteSetParams {
    marketId: BN;
}
export interface VoteResolutionParams {
    marketId: BN;
    resolverIndex: number;
    outcomeIndex: number;
}
export interface FinalizeResolutionParams {
    marketId: BN;
}
export interface RevokeResolutionVoteParams {
    marketId: BN;
    resolverIndex: number;
    /** Must match the active vote’s outcome (see on-chain `resolution_vote.outcome_index`). */
    outcomeIndex: number;
}
export interface RedeemWinningParams {
    marketId: BN;
    /** Number of winning outcome token base units to redeem. */
    amount: BN;
}
export interface CloseMarketEarlyParams {
    marketId: BN;
}
export interface VoidMarketParams {
    marketId: BN;
}
export interface InitializeConfigParams {
    /** Secondary authority pubkey — stored on-chain, can also call restricted instructions. */
    secondaryAuthority: PublicKey;
    /** Default platform fee (bps) on **mint complete set** and **pari-mutuel stake** (collateral deposit). */
    depositPlatformFeeBps: number;
    /** Wallet address that receives platform fees (ATAs are derived per-mint at redemption time). */
    platformTreasuryWallet: PublicKey;
    /** Flat SOL fee charged per mint, redeem, pari stake, and pari withdraw (lamports). Use 0 to disable. */
    platformFeeLamports: BN;
    /**
     * Default protocol share (bps) of **pari-mutuel early-withdraw penalty surplus** (after the pool
     * keeps its slice). Creator sets the complementary share at `initializeParimutuelState`.
     */
    parimutuelPenaltyProtocolShareBps: number;
    /** Bps of gross pari-mutuel withdraw amount; taken from the post-penalty refund slice. */
    parimutuelWithdrawPlatformFeeBps: number;
}
export interface UpdateConfigParams {
    secondaryAuthority: PublicKey;
    depositPlatformFeeBps: number;
    platformTreasuryWallet: PublicKey;
    platformFeeLamports: BN;
    parimutuelPenaltyProtocolShareBps: number;
    parimutuelWithdrawPlatformFeeBps: number;
    /** Pass a new pubkey to rotate the primary authority; pass current authority to keep unchanged. */
    newAuthority: PublicKey;
}
export interface GlobalConfigAccount {
    authority: PublicKey;
    /** Optional secondary authority that can call restricted instructions. */
    secondaryAuthority: PublicKey;
    /** Default platform fee (bps) on mint complete set (deposit). */
    depositPlatformFeeBps: number;
    /** Wallet address (not ATA) — ATAs are derived per-mint at redemption time. */
    platformTreasury: PublicKey;
    /** Flat SOL fee charged per mint/redeem transaction (lamports). */
    platformFeeLamports: BN;
    /** Monotonic counter for `create_market_category` — must match the next category id. */
    nextCategoryId: BN;
    /** Default protocol share of pari-mutuel penalty surplus (see `InitializeParimutuelStateParams`). */
    parimutuelPenaltyProtocolShareBps: number;
    /** Bps of gross pari-mutuel withdraw amount; taken from the post-penalty refund slice. */
    parimutuelWithdrawPlatformFeeBps: number;
}
export interface MarketAccount {
    collateralMint: PublicKey;
    collateralDecimals: number;
    vault: PublicKey;
    outcomeCount: number;
    closeAt: BN;
    closed: boolean;
    resolvedOutcomeIndex: number | null;
    voided: boolean;
    resolutionThreshold: number;
    creator: PublicKey;
    creatorFeeBps: number;
    creatorFeeAccount: PublicKey;
    /** 0 = use global — platform fee on mint complete set (deposit). */
    depositPlatformFeeBps: number;
    bump: number;
    title: string;
    /** `Pubkey::default()` when uncategorized. */
    category: PublicKey;
    /** Anchor enum: `{ completeSet: {} }` or `{ parimutuel: {} }`. */
    marketType: {
        completeSet: Record<string, never>;
    } | {
        parimutuel: Record<string, never>;
    };
}
export interface ResolverAccount {
    resolverPubkey: PublicKey;
}
export interface ResolutionVoteAccount {
    hasVoted: boolean;
    outcomeIndex: number;
}
export interface OutcomeTallyAccount {
    count: number;
}
/** Parameters for `upsertUserProfile`. Both fields are optional to update; pass empty string to leave unchanged conceptually (the program accepts any value ≤ max length). */
export interface UpsertUserProfileParams {
    /** Display name shown in the UI. Max 50 bytes UTF-8. */
    displayName: string;
    /** Optional website or social URL. Max 100 bytes UTF-8. */
    url: string;
}
/** Parameters for `verifyUserProfile`. */
export interface VerifyUserProfileParams {
    /** True to mark the profile as verified; false to revoke verification. */
    verified: boolean;
}
/** On-chain UserProfile account shape (mirrors the Rust `UserProfile` struct). */
export interface UserProfileAccount {
    /** Display name set by the wallet owner. */
    displayName: string;
    /** URL set by the wallet owner. */
    url: string;
    /** Set exclusively by the platform authority via `verifyUserProfile`. */
    verified: boolean;
}
//# sourceMappingURL=types.d.ts.map