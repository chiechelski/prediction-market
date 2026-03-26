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
     * Optional per-market platform fee override in bps.
     * Pass 0 to inherit the global config default.
     */
    platformFeeBps: number;
    /** Number of resolvers (1–8). */
    numResolvers: number;
}
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
    platformFeeBps: number;
    /** Wallet address that receives platform fees (ATAs are derived per-mint at redemption time). */
    platformTreasuryWallet: PublicKey;
    /** Flat SOL fee charged per mint/redeem transaction (lamports). Use 0 to disable. */
    platformFeeLamports: BN;
}
export interface UpdateConfigParams {
    secondaryAuthority: PublicKey;
    platformFeeBps: number;
    platformTreasuryWallet: PublicKey;
    platformFeeLamports: BN;
    /** Pass a new pubkey to rotate the primary authority; pass current authority to keep unchanged. */
    newAuthority: PublicKey;
}
export interface GlobalConfigAccount {
    authority: PublicKey;
    /** Optional secondary authority that can call restricted instructions. */
    secondaryAuthority: PublicKey;
    platformFeeBps: number;
    /** Wallet address (not ATA) — ATAs are derived per-mint at redemption time. */
    platformTreasury: PublicKey;
    /** Flat SOL fee charged per mint/redeem transaction (lamports). */
    platformFeeLamports: BN;
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
    platformFeeBps: number;
    bump: number;
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