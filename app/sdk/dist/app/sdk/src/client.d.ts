import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import type { PredictionMarket } from '../../../target/types/prediction_market';
import type { CreateMarketParams, InitializeParimutuelStateParams, ParimutuelStakeParams, ParimutuelWithdrawParams, ParimutuelClaimParams, InitializeConfigParams, UpdateConfigParams, InitializeMarketResolverSlotsParams, MintCompleteSetParams, RedeemCompleteSetParams, VoteResolutionParams, FinalizeResolutionParams, RevokeResolutionVoteParams, RedeemWinningParams, CloseMarketEarlyParams, VoidMarketParams, GlobalConfigAccount, MarketAccount, UpsertUserProfileParams, VerifyUserProfileParams, UserProfileAccount } from './types';
export declare class PredictionMarketClient {
    readonly program: Program<PredictionMarket>;
    readonly connection: Connection;
    readonly globalConfig: PublicKey;
    constructor(program: Program<PredictionMarket>);
    private get walletKey();
    /**
     * Initialize the global config. Must be called once by the platform authority.
     * `platformTreasuryWallet` is the wallet address that receives platform fees;
     * ATAs are derived per-mint automatically during mint/redeem.
     */
    initializeConfig(params: InitializeConfigParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Update global config. Pass `newAuthority` equal to current authority to keep it unchanged.
     * To rotate the primary authority pass the new pubkey — it must be a valid system account.
     */
    updateConfig(params: UpdateConfigParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
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
     * Step 2 — Initialize resolver PDAs for slots `0..resolverPubkeys.length-1` in **one** transaction.
     */
    initializeMarketResolverSlots(marketPda: PublicKey, params: InitializeMarketResolverSlotsParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Step 3 — Initialize 8 Outcome Mints.
     * Decimals are inherited from the collateral mint stored on the market account.
     */
    initializeMarketMints(marketPda: PublicKey, marketId: BN, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Convenience: run all 3 market creation steps in sequence.
     * Returns the market PDA.
     */
    createMarketFull(creator: PublicKey, collateralMint: PublicKey, creatorFeeAccount: PublicKey, 
    /** Length must equal `params.numResolvers` (typically the first N of an 8-slot UI). */
    resolverPubkeys: PublicKey[], params: CreateMarketParams, opts?: anchor.web3.ConfirmOptions): Promise<PublicKey>;
    /** Pari-mutuel pool + penalty params (step after resolvers, replaces mint init). */
    initializeParimutuelState(marketPda: PublicKey, params: InitializeParimutuelStateParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    parimutuelStake(marketPda: PublicKey, params: ParimutuelStakeParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    parimutuelWithdraw(marketPda: PublicKey, params: ParimutuelWithdrawParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    parimutuelClaim(marketPda: PublicKey, params: ParimutuelClaimParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Mint a complete set of outcome tokens.
     * Fetches `market.outcomeCount` and passes `2 * outcomeCount` remaining accounts:
     * `[outcome_mint_i, user_ata_i]` for each active outcome.
     * Creates any missing outcome ATAs for `user` before sending the instruction.
     * `platformTreasuryWallet` must match GlobalConfig.platformTreasury. The treasury
     * ATA for this collateral mint must already exist (create it client-side if needed).
     * Pass `collateralTokenProgram` as TOKEN_2022_PROGRAM_ID for Token-2022 mints.
     */
    mintCompleteSet(user: PublicKey, marketPda: PublicKey, collateralMint: PublicKey, userCollateralAccount: PublicKey, platformTreasuryWallet: PublicKey, creatorFeeAccount: PublicKey, params: MintCompleteSetParams, opts?: anchor.web3.ConfirmOptions, collateralTokenProgram?: PublicKey): Promise<string>;
    /**
     * Burn one complete set (10^decimals base units of each outcome) and receive
     * the same amount of collateral base units back.
     */
    redeemCompleteSet(user: PublicKey, marketPda: PublicKey, collateralMint: PublicKey, userCollateralAccount: PublicKey, params: RedeemCompleteSetParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Resolver casts a vote for an outcome. Fails if they already have an active vote;
     * call `revokeResolutionVote` first to change outcome (tally 1 → 0 → 1).
     */
    voteResolution(marketPda: PublicKey, params: VoteResolutionParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /** Clears the resolver’s active vote and decrements that outcome’s on-chain tally. */
    revokeResolutionVote(marketPda: PublicKey, params: RevokeResolutionVoteParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Anyone can call `finalizeResolution`. It is a no-op if the threshold is
     * not yet reached; resolves the market once M votes agree on one outcome.
     * Passes optional per-outcome tally accounts (null if that tally PDA was never created).
     */
    finalizeResolution(marketPda: PublicKey, params: FinalizeResolutionParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Burn `amount` winning outcome token base units and receive the same
     * amount of collateral base units from the vault.
     * `platformTreasuryWallet` is the wallet address from GlobalConfig — fetched
     * automatically from on-chain state if not provided.
     */
    redeemWinning(user: PublicKey, marketPda: PublicKey, collateralMint: PublicKey, userCollateralAccount: PublicKey, params: RedeemWinningParams, opts?: anchor.web3.ConfirmOptions, platformTreasuryWallet?: PublicKey): Promise<string>;
    /** Market creator or global config authority can close the market before `close_at`. */
    closeMarketEarly(marketPda: PublicKey, params: CloseMarketEarlyParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /** Void the market (cancel); enables full-set redemption for all holders. Creator or global authority only. */
    voidMarket(marketPda: PublicKey, params: VoidMarketParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    fetchGlobalConfig(): Promise<GlobalConfigAccount>;
    fetchMarket(market: PublicKey): Promise<MarketAccount>;
    /** Returns the collateral balance (base units) held in the vault. */
    fetchVaultBalance(market: PublicKey): Promise<bigint>;
    /** Returns the outcome token balance (base units) for a user and outcome index. */
    fetchOutcomeBalance(market: PublicKey, user: PublicKey, outcomeIndex: number): Promise<bigint>;
    /**
     * Create or update the caller's on-chain user profile.
     * The PDA `["user-profile", wallet]` is initialized on first call (payer = wallet);
     * subsequent calls update `display_name` and `url` without resetting the `verified` flag.
     */
    upsertUserProfile(params: UpsertUserProfileParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Close the caller's user profile, reclaiming the rent lamports.
     * The profile PDA is zeroed and lamports are returned to the wallet.
     */
    closeUserProfile(opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Set or revoke the `verified` flag on any user's profile.
     * Only callable by the platform primary or secondary authority (stored in GlobalConfig).
     *
     * @param targetWallet - The wallet whose profile to update.
     * @param params       - `{ verified: boolean }` — true to verify, false to revoke.
     */
    verifyUserProfile(targetWallet: PublicKey, params: VerifyUserProfileParams, opts?: anchor.web3.ConfirmOptions): Promise<string>;
    /**
     * Fetch a user's on-chain profile. Returns `null` if the profile has never
     * been created (or has been closed).
     */
    fetchUserProfile(wallet: PublicKey): Promise<UserProfileAccount | null>;
    private _ensureAtas;
}
//# sourceMappingURL=client.d.ts.map