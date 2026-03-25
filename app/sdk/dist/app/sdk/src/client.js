"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionMarketClient = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const pda_1 = require("./pda");
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
     * `platformTreasury` is the token account that receives platform fees.
     */
    async initializeConfig(platformFeeBps, platformTreasury, opts) {
        return this.program.methods
            .initializeConfig(platformFeeBps, platformTreasury)
            .accounts({
            globalConfig: this.globalConfig,
            authority: this.walletKey,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /** Update global config fee or treasury. */
    async updateConfig(platformFeeBps, platformTreasury, opts) {
        return this.program.methods
            .updateConfig(platformFeeBps, platformTreasury)
            .accounts({
            globalConfig: this.globalConfig,
            authority: this.walletKey,
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
            platformFeeBps: params.platformFeeBps,
            numResolvers: params.numResolvers,
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
            collateralTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
        return { marketPda, sig };
    }
    /**
     * Step 2 — Initialize up to 8 Resolver PDAs.
     * Fill unused slots with `PublicKey.default`.
     */
    async initializeMarketResolvers(marketPda, params, opts) {
        const resolverPdas = (0, pda_1.deriveAllResolvers)(this.program.programId, marketPda);
        return this.program.methods
            .initializeMarketResolvers({
            marketId: params.marketId,
            resolverPubkeys: params.resolverPubkeys,
            numResolvers: params.numResolvers,
        })
            .accounts({
            payer: this.walletKey,
            market: marketPda,
            systemProgram: web3_js_1.SystemProgram.programId,
            resolver0: resolverPdas[0],
            resolver1: resolverPdas[1],
            resolver2: resolverPdas[2],
            resolver3: resolverPdas[3],
            resolver4: resolverPdas[4],
            resolver5: resolverPdas[5],
            resolver6: resolverPdas[6],
            resolver7: resolverPdas[7],
        })
            .rpc(opts ?? { skipPreflight: true });
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
    async createMarketFull(creator, collateralMint, creatorFeeAccount, resolverPubkeys, params, opts) {
        const { marketPda } = await this.createMarket(creator, collateralMint, creatorFeeAccount, params, opts);
        await this.initializeMarketResolvers(marketPda, {
            marketId: params.marketId,
            resolverPubkeys,
            numResolvers: params.numResolvers,
        }, opts);
        await this.initializeMarketMints(marketPda, params.marketId, opts);
        return marketPda;
    }
    // ─── Trading ────────────────────────────────────────────────────────────────
    /**
     * Mint a complete set of outcome tokens.
     * Creates any missing outcome ATAs for `user` before sending the instruction.
     */
    async mintCompleteSet(user, marketPda, collateralMint, userCollateralAccount, platformTreasury, creatorFeeAccount, params, opts) {
        const outcomeMints = (0, pda_1.deriveAllOutcomeMints)(this.program.programId, marketPda);
        const userOutcomes = outcomeMints.map((m) => (0, spl_token_1.getAssociatedTokenAddressSync)(m, user, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID));
        await this._ensureAtas(user, outcomeMints, userOutcomes);
        return this.program.methods
            .mintCompleteSet({ amount: params.amount, marketId: params.marketId })
            .accounts({
            user,
            market: marketPda,
            vault: (0, pda_1.deriveVault)(this.program.programId, marketPda),
            collateralMint,
            userCollateralAccount,
            platformTreasury,
            creatorFeeAccount,
            globalConfig: this.globalConfig,
            allowedMint: (0, pda_1.deriveAllowedMint)(this.program.programId, collateralMint),
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
    /** A resolver submits (or updates) their vote for an outcome index. */
    async voteResolution(marketPda, params, opts) {
        const resolverPdas = (0, pda_1.deriveAllResolvers)(this.program.programId, marketPda);
        const votePda = (0, pda_1.deriveResolutionVote)(this.program.programId, marketPda, params.resolverIndex);
        return this.program.methods
            .voteResolution({
            marketId: params.marketId,
            resolverIndex: params.resolverIndex,
            outcomeIndex: params.outcomeIndex,
        })
            .accounts({
            resolverSigner: this.walletKey,
            market: marketPda,
            resolutionVote: votePda,
            resolver0: resolverPdas[0],
            resolver1: resolverPdas[1],
            resolver2: resolverPdas[2],
            resolver3: resolverPdas[3],
            resolver4: resolverPdas[4],
            resolver5: resolverPdas[5],
            resolver6: resolverPdas[6],
            resolver7: resolverPdas[7],
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Anyone can call `finalizeResolution`. It is a no-op if the threshold is
     * not yet reached; resolves the market once M votes agree.
     * Automatically derives and passes all 8 vote PDAs (handles absent votes as optional).
     */
    async finalizeResolution(marketPda, params, opts) {
        const votes = Array.from({ length: 8 }, (_, i) => (0, pda_1.deriveResolutionVote)(this.program.programId, marketPda, i));
        return this.program.methods
            .finalizeResolution({ marketId: params.marketId })
            .accounts({
            market: marketPda,
            resolutionVote0: votes[0],
            resolutionVote1: votes[1],
            resolutionVote2: votes[2],
            resolutionVote3: votes[3],
            resolutionVote4: votes[4],
            resolutionVote5: votes[5],
            resolutionVote6: votes[6],
            resolutionVote7: votes[7],
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /**
     * Burn `amount` winning outcome token base units and receive the same
     * amount of collateral base units from the vault.
     */
    async redeemWinning(user, marketPda, collateralMint, userCollateralAccount, params, opts) {
        const market = await this.fetchMarket(marketPda);
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
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    // ─── Market lifecycle ────────────────────────────────────────────────────────
    /** Creator or any resolver can close the market before `close_at`. */
    async closeMarketEarly(marketPda, params, opts) {
        const resolverPdas = (0, pda_1.deriveAllResolvers)(this.program.programId, marketPda);
        return this.program.methods
            .closeMarketEarly({ marketId: params.marketId })
            .accounts({
            signer: this.walletKey,
            market: marketPda,
            resolver0: resolverPdas[0],
            resolver1: resolverPdas[1],
            resolver2: resolverPdas[2],
            resolver3: resolverPdas[3],
            resolver4: resolverPdas[4],
            resolver5: resolverPdas[5],
            resolver6: resolverPdas[6],
            resolver7: resolverPdas[7],
        })
            .rpc(opts ?? { skipPreflight: true });
    }
    /** Void the market (cancel); enables full-set redemption for all holders. */
    async voidMarket(marketPda, params, opts) {
        const resolverPdas = (0, pda_1.deriveAllResolvers)(this.program.programId, marketPda);
        return this.program.methods
            .voidMarket({ marketId: params.marketId })
            .accounts({
            signer: this.walletKey,
            market: marketPda,
            resolver0: resolverPdas[0],
            resolver1: resolverPdas[1],
            resolver2: resolverPdas[2],
            resolver3: resolverPdas[3],
            resolver4: resolverPdas[4],
            resolver5: resolverPdas[5],
            resolver6: resolverPdas[6],
            resolver7: resolverPdas[7],
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