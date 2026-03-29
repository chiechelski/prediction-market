"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionMarketClient = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const pda_1 = require("./pda");
const types_1 = require("./types");
class PredictionMarketClient {
    constructor(program) {
        this.program = program;
        this.connection = program.provider.connection;
        this.globalConfig = (0, pda_1.deriveGlobalConfig)(program.programId);
    }
    get walletKey() {
        return this.program.provider.wallet.publicKey;
    }
    // ─── Admin ──────────────────────────────────────────────────────────────────
    /**
     * Initialize the global config. Must be called once by the platform authority.
     * `platformTreasuryWallet` is the wallet address that receives platform fees;
     * ATAs are derived per-mint automatically during mint/redeem.
     */
    async initializeConfig(params, opts) {
        return this.program.methods
            .initializeConfig(params.secondaryAuthority, params.depositPlatformFeeBps, params.platformTreasuryWallet, params.platformFeeLamports, params.parimutuelPenaltyProtocolShareBps, params.parimutuelWithdrawPlatformFeeBps)
            .accounts({
            globalConfig: this.globalConfig,
            authority: this.walletKey,
            secondaryAuthority: params.secondaryAuthority,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Update global config. Pass `newAuthority` equal to current authority to keep it unchanged.
     * To rotate the primary authority pass the new pubkey — it must be a valid system account.
     */
    async updateConfig(params, opts) {
        return this.program.methods
            .updateConfig(params.secondaryAuthority, params.depositPlatformFeeBps, params.platformTreasuryWallet, params.platformFeeLamports, params.parimutuelPenaltyProtocolShareBps, params.parimutuelWithdrawPlatformFeeBps)
            .accounts({
            globalConfig: this.globalConfig,
            authority: this.walletKey,
            newAuthority: params.newAuthority,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Add a collateral mint to the allowlist.
     * Only the global config authority can call this.
     */
    async addAllowedCollateralMint(mint, opts) {
        return this.program.methods
            .addAllowedCollateralMint()
            .accounts({
            allowedMint: (0, pda_1.deriveAllowedMint)(this.program.programId, mint),
            globalConfig: this.globalConfig,
            authority: this.walletKey,
            mint,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /** Remove a collateral mint from the allowlist. */
    async removeAllowedCollateralMint(mint, opts) {
        return this.program.methods
            .removeAllowedCollateralMint()
            .accounts({
            allowedMint: (0, pda_1.deriveAllowedMint)(this.program.programId, mint),
            globalConfig: this.globalConfig,
            authority: this.walletKey,
            mint,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    // ─── Market creation (3 steps) ──────────────────────────────────────────────
    /**
     * Step 1 — Create Market + Vault.
     * Returns the market PDA and the transaction signature.
     */
    async createMarket(creator, collateralMint, creatorFeeAccount, params, opts) {
        const marketPda = (0, pda_1.deriveMarket)(this.program.programId, creator, params.marketId);
        const vaultPda = (0, pda_1.deriveVault)(this.program.programId, marketPda);
        const sig = await this.program.methods
            .createMarket({
            marketId: params.marketId,
            outcomeCount: params.outcomeCount,
            resolutionThreshold: params.resolutionThreshold,
            closeAt: params.closeAt,
            creatorFeeBps: params.creatorFeeBps,
            depositPlatformFeeBps: params.depositPlatformFeeBps,
            numResolvers: params.numResolvers,
            title: params.title,
            marketType: (0, types_1.toMarketTypeIx)(params.marketType),
        })
            .accounts({
            payer: this.walletKey,
            market: marketPda,
            vault: vaultPda,
            collateralMint,
            creator,
            creatorFeeAccount,
            globalConfig: this.globalConfig,
            allowedMint: (0, pda_1.deriveAllowedMint)(this.program.programId, collateralMint),
            marketCategory: params.marketCategory ?? null,
            collateralTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
        return { marketPda, sig };
    }
    /**
     * Step 2 — Initialize resolver PDAs for slots `0..resolverPubkeys.length-1` in **one** transaction.
     */
    async initializeMarketResolverSlots(marketPda, params, opts) {
        const provider = this.program.provider;
        const tx = new web3_js_1.Transaction();
        const { marketId, resolverPubkeys } = params;
        for (let i = 0; i < resolverPubkeys.length; i++) {
            const ix = await this.program.methods
                .initializeMarketResolver({
                marketId,
                resolverIndex: i,
                resolverPubkey: resolverPubkeys[i],
            })
                .accounts({
                payer: this.walletKey,
                market: marketPda,
                resolver: (0, pda_1.deriveResolver)(this.program.programId, marketPda, i),
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .instruction();
            tx.add(ix);
        }
        return await provider.sendAndConfirm(tx, undefined, opts ?? { skipPreflight: true });
    }
    /**
     * Step 3 — Initialize 8 Outcome Mints.
     * Decimals are inherited from the collateral mint stored on the market account.
     */
    async initializeMarketMints(marketPda, marketId, opts) {
        const outcomeMints = (0, pda_1.deriveAllOutcomeMints)(this.program.programId, marketPda);
        return this.program.methods
            .initializeMarketMints({ marketId })
            .accounts({
            payer: this.walletKey,
            market: marketPda,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
            outcomeMint0: outcomeMints[0],
            outcomeMint1: outcomeMints[1],
            outcomeMint2: outcomeMints[2],
            outcomeMint3: outcomeMints[3],
            outcomeMint4: outcomeMints[4],
            outcomeMint5: outcomeMints[5],
            outcomeMint6: outcomeMints[6],
            outcomeMint7: outcomeMints[7],
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Convenience: run all 3 market creation steps in sequence.
     * Returns the market PDA.
     */
    async createMarketFull(creator, collateralMint, creatorFeeAccount, 
    /** Length must equal `params.numResolvers` (typically the first N of an 8-slot UI). */
    resolverPubkeys, params, opts) {
        const { marketPda } = await this.createMarket(creator, collateralMint, creatorFeeAccount, params, opts);
        await this.initializeMarketResolverSlots(marketPda, {
            marketId: params.marketId,
            resolverPubkeys: resolverPubkeys.slice(0, params.numResolvers),
        }, opts);
        if (params.marketType === 'parimutuel') {
            const gc = await this.fetchGlobalConfig();
            const pi = params.parimutuelInit ?? {};
            const penaltySurplusCreatorShareBps = pi.penaltySurplusCreatorShareBps ??
                10000 - gc.parimutuelPenaltyProtocolShareBps;
            await this.initializeParimutuelState(marketPda, {
                marketId: params.marketId,
                earlyWithdrawPenaltyBps: pi.earlyWithdrawPenaltyBps ?? 500,
                penaltyKeptInPoolBps: pi.penaltyKeptInPoolBps ?? 8000,
                penaltySurplusCreatorShareBps,
            }, opts);
        }
        else {
            await this.initializeMarketMints(marketPda, params.marketId, opts);
        }
        return marketPda;
    }
    /** Pari-mutuel pool + penalty params (step after resolvers, replaces mint init). */
    async initializeParimutuelState(marketPda, params, opts) {
        const parimutuelState = (0, pda_1.deriveParimutuelState)(this.program.programId, marketPda);
        return this.program.methods
            .initializeParimutuelState({
            marketId: params.marketId,
            earlyWithdrawPenaltyBps: params.earlyWithdrawPenaltyBps,
            penaltyKeptInPoolBps: params.penaltyKeptInPoolBps,
            penaltySurplusCreatorShareBps: params.penaltySurplusCreatorShareBps,
        })
            .accounts({
            payer: this.walletKey,
            market: marketPda,
            globalConfig: this.globalConfig,
            parimutuelState,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    async parimutuelStake(marketPda, params, opts) {
        const parimutuelState = (0, pda_1.deriveParimutuelState)(this.program.programId, marketPda);
        const market = await this.fetchMarket(marketPda);
        const globalConfig = await this.fetchGlobalConfig();
        const position = (0, pda_1.deriveParimutuelPosition)(this.program.programId, marketPda, this.walletKey, params.outcomeIndex);
        const vaultPda = (0, pda_1.deriveVault)(this.program.programId, marketPda);
        const allowedMint = (0, pda_1.deriveAllowedMint)(this.program.programId, market.collateralMint);
        const userCollateral = (0, spl_token_1.getAssociatedTokenAddressSync)(market.collateralMint, this.walletKey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        const platformTreasuryAta = (0, spl_token_1.getAssociatedTokenAddressSync)(market.collateralMint, globalConfig.platformTreasury, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        return this.program.methods
            .parimutuelStake({
            marketId: params.marketId,
            outcomeIndex: params.outcomeIndex,
            amount: params.amount,
        })
            .accounts({
            user: this.walletKey,
            market: marketPda,
            parimutuelState,
            position,
            vault: vaultPda,
            collateralMint: market.collateralMint,
            userCollateralAccount: userCollateral,
            creatorFeeAccount: market.creatorFeeAccount,
            globalConfig: this.globalConfig,
            platformTreasuryWallet: globalConfig.platformTreasury,
            platformTreasuryAta,
            allowedMint,
            collateralTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    async parimutuelWithdraw(marketPda, params, opts) {
        const parimutuelState = (0, pda_1.deriveParimutuelState)(this.program.programId, marketPda);
        const market = await this.fetchMarket(marketPda);
        const position = (0, pda_1.deriveParimutuelPosition)(this.program.programId, marketPda, this.walletKey, params.outcomeIndex);
        const vaultPda = (0, pda_1.deriveVault)(this.program.programId, marketPda);
        const globalConfig = await this.fetchGlobalConfig();
        const userCollateral = (0, spl_token_1.getAssociatedTokenAddressSync)(market.collateralMint, this.walletKey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        const platformTreasuryAta = (0, spl_token_1.getAssociatedTokenAddressSync)(market.collateralMint, globalConfig.platformTreasury, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        return this.program.methods
            .parimutuelWithdraw({
            marketId: params.marketId,
            outcomeIndex: params.outcomeIndex,
            amount: params.amount,
        })
            .accounts({
            user: this.walletKey,
            market: marketPda,
            creatorFeeAccount: market.creatorFeeAccount,
            parimutuelState,
            position,
            vault: vaultPda,
            collateralMint: market.collateralMint,
            userCollateralAccount: userCollateral,
            globalConfig: this.globalConfig,
            platformTreasuryWallet: globalConfig.platformTreasury,
            platformTreasuryAta,
            collateralTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    async parimutuelClaim(marketPda, params, opts) {
        const parimutuelState = (0, pda_1.deriveParimutuelState)(this.program.programId, marketPda);
        const market = await this.fetchMarket(marketPda);
        const position = (0, pda_1.deriveParimutuelPosition)(this.program.programId, marketPda, this.walletKey, params.outcomeIndex);
        const vaultPda = (0, pda_1.deriveVault)(this.program.programId, marketPda);
        const userCollateral = (0, spl_token_1.getAssociatedTokenAddressSync)(market.collateralMint, this.walletKey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        return this.program.methods
            .parimutuelClaim({
            marketId: params.marketId,
            outcomeIndex: params.outcomeIndex,
        })
            .accounts({
            user: this.walletKey,
            market: marketPda,
            parimutuelState,
            position,
            vault: vaultPda,
            collateralMint: market.collateralMint,
            userCollateralAccount: userCollateral,
            collateralTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    // ─── Trading ────────────────────────────────────────────────────────────────
    /**
     * Mint a complete set of outcome tokens.
     * Fetches `market.outcomeCount` and passes `2 * outcomeCount` remaining accounts:
     * `[outcome_mint_i, user_ata_i]` for each active outcome.
     * Creates any missing outcome ATAs for `user` before sending the instruction.
     * `platformTreasuryWallet` must match GlobalConfig.platformTreasury. The treasury
     * ATA for this collateral mint must already exist (create it client-side if needed).
     * Pass `collateralTokenProgram` as TOKEN_2022_PROGRAM_ID for Token-2022 mints.
     */
    async mintCompleteSet(user, marketPda, collateralMint, userCollateralAccount, platformTreasuryWallet, creatorFeeAccount, params, opts, collateralTokenProgram = spl_token_1.TOKEN_PROGRAM_ID) {
        const market = await this.fetchMarket(marketPda);
        const oc = market.outcomeCount;
        const n = anchor_1.BN.isBN(oc) ? oc.toNumber() : Number(oc);
        const outcomeMints = (0, pda_1.deriveAllOutcomeMints)(this.program.programId, marketPda).slice(0, n);
        const userOutcomes = outcomeMints.map((m) => (0, spl_token_1.getAssociatedTokenAddressSync)(m, user, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID));
        const platformTreasuryAta = (0, spl_token_1.getAssociatedTokenAddressSync)(collateralMint, platformTreasuryWallet, false, collateralTokenProgram, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        await this._ensureAtas(user, outcomeMints, userOutcomes);
        const remainingAccounts = outcomeMints.flatMap((mint, i) => [
            { pubkey: mint, isSigner: false, isWritable: true },
            { pubkey: userOutcomes[i], isSigner: false, isWritable: true },
        ]);
        return this.program.methods
            .mintCompleteSet({ amount: params.amount, marketId: params.marketId })
            .accounts({
            user,
            market: marketPda,
            vault: (0, pda_1.deriveVault)(this.program.programId, marketPda),
            collateralMint,
            userCollateralAccount,
            creatorFeeAccount,
            globalConfig: this.globalConfig,
            allowedMint: (0, pda_1.deriveAllowedMint)(this.program.programId, collateralMint),
            platformTreasuryWallet,
            platformTreasuryAta,
            collateralTokenProgram,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .remainingAccounts(remainingAccounts)
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Burn one complete set (10^decimals base units of each outcome) and receive
     * the same amount of collateral base units back.
     */
    async redeemCompleteSet(user, marketPda, collateralMint, userCollateralAccount, params, opts) {
        const outcomeMints = (0, pda_1.deriveAllOutcomeMints)(this.program.programId, marketPda);
        const userOutcomes = outcomeMints.map((m) => (0, spl_token_1.getAssociatedTokenAddressSync)(m, user, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID));
        return this.program.methods
            .redeemCompleteSet({ marketId: params.marketId })
            .accounts({
            user,
            market: marketPda,
            vault: (0, pda_1.deriveVault)(this.program.programId, marketPda),
            collateralMint,
            userCollateralAccount,
            outcomeMint0: outcomeMints[0],
            outcomeMint1: outcomeMints[1],
            outcomeMint2: outcomeMints[2],
            outcomeMint3: outcomeMints[3],
            outcomeMint4: outcomeMints[4],
            outcomeMint5: outcomeMints[5],
            outcomeMint6: outcomeMints[6],
            outcomeMint7: outcomeMints[7],
            userOutcome0: userOutcomes[0],
            userOutcome1: userOutcomes[1],
            userOutcome2: userOutcomes[2],
            userOutcome3: userOutcomes[3],
            userOutcome4: userOutcomes[4],
            userOutcome5: userOutcomes[5],
            userOutcome6: userOutcomes[6],
            userOutcome7: userOutcomes[7],
            collateralTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    // ─── Resolution ─────────────────────────────────────────────────────────────
    /**
     * Resolver casts a vote for an outcome. Fails if they already have an active vote;
     * call `revokeResolutionVote` first to change outcome (tally 1 → 0 → 1).
     */
    async voteResolution(marketPda, params, opts) {
        const votePda = (0, pda_1.deriveResolutionVote)(this.program.programId, marketPda, params.resolverIndex);
        const tallyPda = (0, pda_1.deriveOutcomeTally)(this.program.programId, marketPda, params.outcomeIndex);
        return this.program.methods
            .voteResolution({
            marketId: params.marketId,
            resolverIndex: params.resolverIndex,
            outcomeIndex: params.outcomeIndex,
        })
            .accounts({
            resolverSigner: this.walletKey,
            market: marketPda,
            resolver: (0, pda_1.deriveResolver)(this.program.programId, marketPda, params.resolverIndex),
            resolutionVote: votePda,
            outcomeTally: tallyPda,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /** Clears the resolver’s active vote and decrements that outcome’s on-chain tally. */
    async revokeResolutionVote(marketPda, params, opts) {
        const votePda = (0, pda_1.deriveResolutionVote)(this.program.programId, marketPda, params.resolverIndex);
        const tallyPda = (0, pda_1.deriveOutcomeTally)(this.program.programId, marketPda, params.outcomeIndex);
        return this.program.methods
            .revokeResolutionVote({
            marketId: params.marketId,
            resolverIndex: params.resolverIndex,
            outcomeIndex: params.outcomeIndex,
        })
            .accounts({
            resolverSigner: this.walletKey,
            market: marketPda,
            resolver: (0, pda_1.deriveResolver)(this.program.programId, marketPda, params.resolverIndex),
            resolutionVote: votePda,
            outcomeTally: tallyPda,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Anyone can call `finalizeResolution`. It is a no-op if the threshold is
     * not yet reached; resolves the market once M votes agree on one outcome.
     * Passes optional per-outcome tally accounts (null if that tally PDA was never created).
     */
    async finalizeResolution(marketPda, params, opts) {
        const tallies = (0, pda_1.deriveAllOutcomeTallies)(this.program.programId, marketPda);
        const infos = await Promise.all(tallies.map((p) => this.connection.getAccountInfo(p)));
        return this.program.methods
            .finalizeResolution({ marketId: params.marketId })
            .accounts({
            market: marketPda,
            outcomeTally0: infos[0] ? tallies[0] : null,
            outcomeTally1: infos[1] ? tallies[1] : null,
            outcomeTally2: infos[2] ? tallies[2] : null,
            outcomeTally3: infos[3] ? tallies[3] : null,
            outcomeTally4: infos[4] ? tallies[4] : null,
            outcomeTally5: infos[5] ? tallies[5] : null,
            outcomeTally6: infos[6] ? tallies[6] : null,
            outcomeTally7: infos[7] ? tallies[7] : null,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Burn `amount` winning outcome token base units and receive the same
     * amount of collateral base units from the vault.
     * `platformTreasuryWallet` is the wallet address from GlobalConfig — fetched
     * automatically from on-chain state if not provided.
     */
    async redeemWinning(user, marketPda, collateralMint, userCollateralAccount, params, opts, platformTreasuryWallet) {
        const [market, config] = await Promise.all([
            this.fetchMarket(marketPda),
            platformTreasuryWallet ? Promise.resolve(null) : this.fetchGlobalConfig(),
        ]);
        const treasuryWallet = platformTreasuryWallet ?? config.platformTreasury;
        const outcomeMints = (0, pda_1.deriveAllOutcomeMints)(this.program.programId, marketPda);
        const winningIndex = market.resolvedOutcomeIndex;
        const userWinningOutcome = (0, spl_token_1.getAssociatedTokenAddressSync)(outcomeMints[winningIndex], user, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        return this.program.methods
            .redeemWinning({ marketId: params.marketId, amount: params.amount })
            .accounts({
            user,
            market: marketPda,
            vault: (0, pda_1.deriveVault)(this.program.programId, marketPda),
            collateralMint,
            userCollateralAccount,
            globalConfig: this.globalConfig,
            platformTreasuryWallet: treasuryWallet,
            outcomeMint0: outcomeMints[0],
            outcomeMint1: outcomeMints[1],
            outcomeMint2: outcomeMints[2],
            outcomeMint3: outcomeMints[3],
            outcomeMint4: outcomeMints[4],
            outcomeMint5: outcomeMints[5],
            outcomeMint6: outcomeMints[6],
            outcomeMint7: outcomeMints[7],
            userWinningOutcome,
            collateralTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    // ─── Market lifecycle ────────────────────────────────────────────────────────
    /** Market creator or global config authority can close the market before `close_at`. */
    async closeMarketEarly(marketPda, params, opts) {
        return this.program.methods
            .closeMarketEarly({ marketId: params.marketId })
            .accounts({
            signer: this.walletKey,
            globalConfig: this.globalConfig,
            market: marketPda,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /** Void the market (cancel); enables full-set redemption for all holders. Creator or global authority only. */
    async voidMarket(marketPda, params, opts) {
        return this.program.methods
            .voidMarket({ marketId: params.marketId })
            .accounts({
            signer: this.walletKey,
            globalConfig: this.globalConfig,
            market: marketPda,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    // ─── State readers ───────────────────────────────────────────────────────────
    async fetchGlobalConfig() {
        return this.program.account.globalConfig.fetch(this.globalConfig);
    }
    async fetchMarket(market) {
        return this.program.account.market.fetch(market);
    }
    /** Returns the collateral balance (base units) held in the vault. */
    async fetchVaultBalance(market) {
        const vault = (0, pda_1.deriveVault)(this.program.programId, market);
        const acc = await (0, spl_token_1.getAccount)(this.connection, vault, undefined, spl_token_1.TOKEN_PROGRAM_ID);
        return acc.amount;
    }
    /** Returns the outcome token balance (base units) for a user and outcome index. */
    async fetchOutcomeBalance(market, user, outcomeIndex) {
        const mint = (0, pda_1.deriveOutcomeMint)(this.program.programId, market, outcomeIndex);
        const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(mint, user, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        const acc = await (0, spl_token_1.getAccount)(this.connection, ata, undefined, spl_token_1.TOKEN_PROGRAM_ID);
        return acc.amount;
    }
    // ─── User profiles ───────────────────────────────────────────────────────────
    /**
     * Create or update the caller's on-chain user profile.
     * The PDA `["user-profile", wallet]` is initialized on first call (payer = wallet);
     * subsequent calls update `display_name` and `url` without resetting the `verified` flag.
     */
    async upsertUserProfile(params, opts) {
        return this.program.methods
            .upsertUserProfile(params.displayName, params.url)
            .accounts({
            userProfile: (0, pda_1.deriveUserProfile)(this.program.programId, this.walletKey),
            wallet: this.walletKey,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Close the caller's user profile, reclaiming the rent lamports.
     * The profile PDA is zeroed and lamports are returned to the wallet.
     */
    async closeUserProfile(opts) {
        return this.program.methods
            .closeUserProfile()
            .accounts({
            userProfile: (0, pda_1.deriveUserProfile)(this.program.programId, this.walletKey),
            wallet: this.walletKey,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Set or revoke the `verified` flag on any user's profile.
     * Only callable by the platform primary or secondary authority (stored in GlobalConfig).
     *
     * @param targetWallet - The wallet whose profile to update.
     * @param params       - `{ verified: boolean }` — true to verify, false to revoke.
     */
    async verifyUserProfile(targetWallet, params, opts) {
        return this.program.methods
            .verifyUserProfile(params.verified)
            .accounts({
            userProfile: (0, pda_1.deriveUserProfile)(this.program.programId, targetWallet),
            targetWallet,
            authority: this.walletKey,
            globalConfig: this.globalConfig,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Fetch a user's on-chain profile. Returns `null` if the profile has never
     * been created (or has been closed).
     */
    async fetchUserProfile(wallet) {
        const pda = (0, pda_1.deriveUserProfile)(this.program.programId, wallet);
        const info = await this.connection.getAccountInfo(pda);
        if (!info)
            return null;
        return this.program.account.userProfile.fetch(pda);
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    async _ensureAtas(owner, mints, atas) {
        const checks = await Promise.all(atas.map((ata) => this.connection.getAccountInfo(ata).then((info) => info === null)));
        const missing = mints
            .map((mint, i) => ({ mint, ata: atas[i], create: checks[i] }))
            .filter((x) => x.create)
            .map((x) => (0, spl_token_1.createAssociatedTokenAccountInstruction)(this.walletKey, x.ata, owner, x.mint, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID));
        if (missing.length === 0)
            return;
        const tx = new web3_js_1.Transaction().add(...missing);
        const wallet = this.program.provider.wallet;
        await (0, web3_js_1.sendAndConfirmTransaction)(this.connection, tx, [{ publicKey: wallet.publicKey, signTransaction: wallet.signTransaction.bind(wallet), signAllTransactions: wallet.signAllTransactions.bind(wallet) }], { skipPreflight: true });
    }
}
exports.PredictionMarketClient = PredictionMarketClient;
//# sourceMappingURL=client.js.map