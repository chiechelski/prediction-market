import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import type { PredictionMarket } from '../../../target/types/prediction_market';
import type { CreateMarketParams, InitializeMarketResolversParams, MintCompleteSetParams, RedeemCompleteSetParams, VoteResolutionParams, FinalizeResolutionParams, RedeemWinningParams, CloseMarketEarlyParams, VoidMarketParams, GlobalConfigAccount, MarketAccount } from './types';
export declare class PredictionMarketClient {
    readonly program: Program<PredictionMarket>;
    readonly connection: Connection;
    readonly globalConfig: PublicKey;
    constructor(program: Program<PredictionMarket>);
    private get walletKey();
    /**
     * Initialize the global config. Must be called once by the platform authority.
     * `platformTreasury` is the token account that receives platform fees.
     */
    initializeConfig(platformFeeBps: number, platformTreasury: PublicKey, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /** Update global config fee or treasury. */
    updateConfig(platformFeeBps: number, platformTreasury: PublicKey, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Add a collateral mint to the allowlist.
     * Only the global config authority can call this.
     */
    addAllowedCollateralMint(mint: PublicKey, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /** Remove a collateral mint from the allowlist. */
    removeAllowedCollateralMint(mint: PublicKey, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Step 1 — Create Market + Vault.
     * Returns the market PDA and the transaction signature.
     */
    createMarket(creator: PublicKey, collateralMint: PublicKey, creatorFeeAccount: PublicKey, params: CreateMarketParams, opts?: anchor.web3.ConfirmOptions): Promise<{
        marketPda: PublicKey;
        sig: string;
    }>;
    /**
     * Step 2 — Initialize up to 8 Resolver PDAs.
     * Fill unused slots with `PublicKey.default`.
     */
    initializeMarketResolvers(marketPda: PublicKey, params: InitializeMarketResolversParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Step 3 — Initialize 8 Outcome Mints.
     * Decimals are inherited from the collateral mint stored on the market account.
     */
    initializeMarketMints(marketPda: PublicKey, marketId: BN, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Convenience: run all 3 market creation steps in sequence.
     * Returns the market PDA.
     */
    createMarketFull(creator: PublicKey, collateralMint: PublicKey, creatorFeeAccount: PublicKey, resolverPubkeys: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey, PublicKey, PublicKey, PublicKey], params: CreateMarketParams, opts?: anchor.web3.ConfirmOptions): Promise<PublicKey>;
    /**
     * Mint a complete set of outcome tokens.
     * Creates any missing outcome ATAs for `user` before sending the instruction.
     */
    mintCompleteSet(user: PublicKey, marketPda: PublicKey, collateralMint: PublicKey, userCollateralAccount: PublicKey, platformTreasury: PublicKey, creatorFeeAccount: PublicKey, params: MintCompleteSetParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Burn one complete set (10^decimals base units of each outcome) and receive
     * the same amount of collateral base units back.
     */
    redeemCompleteSet(user: PublicKey, marketPda: PublicKey, collateralMint: PublicKey, userCollateralAccount: PublicKey, params: RedeemCompleteSetParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /** A resolver submits (or updates) their vote for an outcome index. */
    voteResolution(marketPda: PublicKey, params: VoteResolutionParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Anyone can call `finalizeResolution`. It is a no-op if the threshold is
     * not yet reached; resolves the market once M votes agree.
     * Automatically derives and passes all 8 vote PDAs (handles absent votes as optional).
     */
    finalizeResolution(marketPda: PublicKey, params: FinalizeResolutionParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Burn `amount` winning outcome token base units and receive the same
     * amount of collateral base units from the vault.
     */
    redeemWinning(user: PublicKey, marketPda: PublicKey, collateralMint: PublicKey, userCollateralAccount: PublicKey, params: RedeemWinningParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /** Creator or any resolver can close the market before `close_at`. */
    closeMarketEarly(marketPda: PublicKey, params: CloseMarketEarlyParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /** Void the market (cancel); enables full-set redemption for all holders. */
    voidMarket(marketPda: PublicKey, params: VoidMarketParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    fetchGlobalConfig(): Promise<GlobalConfigAccount>;
    fetchMarket(market: PublicKey): Promise<MarketAccount>;
    /** Returns the collateral balance (base units) held in the vault. */
    fetchVaultBalance(market: PublicKey): Promise<bigint>;
    /** Returns the outcome token balance (base units) for a user and outcome index. */
    fetchOutcomeBalance(market: PublicKey, user: PublicKey, outcomeIndex: number): Promise<bigint>;
    private _ensureAtas;
}
//# sourceMappingURL=client.d.ts.map