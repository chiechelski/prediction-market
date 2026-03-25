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
export interface GlobalConfigAccount {
    authority: PublicKey;
    platformFeeBps: number;
    platformTreasury: PublicKey;
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
    market: PublicKey;
    resolverIndex: number;
    outcomeIndex: number;
}
//# sourceMappingURL=types.d.ts.map