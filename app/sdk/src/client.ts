import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from '@solana/spl-token';
import type { PredictionMarket } from '../../../target/types/prediction_market';
import {
  deriveGlobalConfig,
  deriveAllowedMint,
  deriveMarket,
  deriveVault,
  deriveOutcomeMint,
  deriveAllOutcomeMints,
  deriveAllResolvers,
  deriveAllOutcomeTallies,
  deriveOutcomeTally,
  deriveResolutionVote,
  deriveUserProfile,
} from './pda';
import type {
  CreateMarketParams,
  InitializeConfigParams,
  UpdateConfigParams,
  InitializeMarketResolversParams,
  MintCompleteSetParams,
  RedeemCompleteSetParams,
  VoteResolutionParams,
  FinalizeResolutionParams,
  RevokeResolutionVoteParams,
  RedeemWinningParams,
  CloseMarketEarlyParams,
  VoidMarketParams,
  GlobalConfigAccount,
  MarketAccount,
  UpsertUserProfileParams,
  VerifyUserProfileParams,
  UserProfileAccount,
} from './types';

// Anchor 0.31 generates very strict union account types; cast to any for the
// accounts() call (standard practice in the Anchor ecosystem).
type AnyAccounts = Record<string, PublicKey | null>;

export class PredictionMarketClient {
  readonly program: Program<PredictionMarket>;
  readonly connection: Connection;
  readonly globalConfig: PublicKey;

  constructor(program: Program<PredictionMarket>) {
    this.program = program;
    this.connection = program.provider.connection;
    this.globalConfig = deriveGlobalConfig(program.programId);
  }

  private get walletKey(): PublicKey {
    return (this.program.provider as anchor.AnchorProvider).wallet.publicKey;
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────

  /**
   * Initialize the global config. Must be called once by the platform authority.
   * `platformTreasuryWallet` is the wallet address that receives platform fees;
   * ATAs are derived per-mint automatically during mint/redeem.
   */
  async initializeConfig(
    params: InitializeConfigParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    return this.program.methods
      .initializeConfig(
        params.secondaryAuthority,
        params.platformFeeBps,
        params.platformTreasuryWallet,
        params.platformFeeLamports,
      )
      .accounts({
        globalConfig: this.globalConfig,
        authority: this.walletKey,
        secondaryAuthority: params.secondaryAuthority,
        systemProgram: SystemProgram.programId,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /**
   * Update global config. Pass `newAuthority` equal to current authority to keep it unchanged.
   * To rotate the primary authority pass the new pubkey — it must be a valid system account.
   */
  async updateConfig(
    params: UpdateConfigParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    return this.program.methods
      .updateConfig(
        params.secondaryAuthority,
        params.platformFeeBps,
        params.platformTreasuryWallet,
        params.platformFeeLamports,
      )
      .accounts({
        globalConfig: this.globalConfig,
        authority: this.walletKey,
        newAuthority: params.newAuthority,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /**
   * Add a collateral mint to the allowlist.
   * Only the global config authority can call this.
   */
  async addAllowedCollateralMint(
    mint: PublicKey,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    return this.program.methods
      .addAllowedCollateralMint()
      .accounts({
        allowedMint: deriveAllowedMint(this.program.programId, mint),
        globalConfig: this.globalConfig,
        authority: this.walletKey,
        mint,
        systemProgram: SystemProgram.programId,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /** Remove a collateral mint from the allowlist. */
  async removeAllowedCollateralMint(
    mint: PublicKey,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    return this.program.methods
      .removeAllowedCollateralMint()
      .accounts({
        allowedMint: deriveAllowedMint(this.program.programId, mint),
        globalConfig: this.globalConfig,
        authority: this.walletKey,
        mint,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  // ─── Market creation (3 steps) ──────────────────────────────────────────────

  /**
   * Step 1 — Create Market + Vault.
   * Returns the market PDA and the transaction signature.
   */
  async createMarket(
    creator: PublicKey,
    collateralMint: PublicKey,
    creatorFeeAccount: PublicKey,
    params: CreateMarketParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<{ marketPda: PublicKey; sig: string }> {
    const marketPda = deriveMarket(this.program.programId, creator, params.marketId);
    const vaultPda = deriveVault(this.program.programId, marketPda);

    const sig = await this.program.methods
      .createMarket({
        marketId: params.marketId,
        outcomeCount: params.outcomeCount,
        resolutionThreshold: params.resolutionThreshold,
        closeAt: params.closeAt,
        creatorFeeBps: params.creatorFeeBps,
        platformFeeBps: params.platformFeeBps,
        numResolvers: params.numResolvers,
        title: params.title,
      })
      .accounts({
        payer: this.walletKey,
        market: marketPda,
        vault: vaultPda,
        collateralMint,
        creator,
        creatorFeeAccount,
        globalConfig: this.globalConfig,
        allowedMint: deriveAllowedMint(this.program.programId, collateralMint),
        marketCategory: params.marketCategory ?? null,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });

    return { marketPda, sig };
  }

  /**
   * Step 2 — Initialize up to 8 Resolver PDAs.
   * Fill unused slots with `PublicKey.default`.
   */
  async initializeMarketResolvers(
    marketPda: PublicKey,
    params: InitializeMarketResolversParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    const resolverPdas = deriveAllResolvers(this.program.programId, marketPda);

    return this.program.methods
      .initializeMarketResolvers({
        marketId: params.marketId,
        resolverPubkeys: params.resolverPubkeys,
        numResolvers: params.numResolvers,
      })
      .accounts({
        payer: this.walletKey,
        market: marketPda,
        systemProgram: SystemProgram.programId,
        resolver0: resolverPdas[0],
        resolver1: resolverPdas[1],
        resolver2: resolverPdas[2],
        resolver3: resolverPdas[3],
        resolver4: resolverPdas[4],
        resolver5: resolverPdas[5],
        resolver6: resolverPdas[6],
        resolver7: resolverPdas[7],
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /**
   * Step 3 — Initialize 8 Outcome Mints.
   * Decimals are inherited from the collateral mint stored on the market account.
   */
  async initializeMarketMints(
    marketPda: PublicKey,
    marketId: BN,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    const outcomeMints = deriveAllOutcomeMints(this.program.programId, marketPda);

    return this.program.methods
      .initializeMarketMints({ marketId })
      .accounts({
        payer: this.walletKey,
        market: marketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        outcomeMint0: outcomeMints[0],
        outcomeMint1: outcomeMints[1],
        outcomeMint2: outcomeMints[2],
        outcomeMint3: outcomeMints[3],
        outcomeMint4: outcomeMints[4],
        outcomeMint5: outcomeMints[5],
        outcomeMint6: outcomeMints[6],
        outcomeMint7: outcomeMints[7],
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /**
   * Convenience: run all 3 market creation steps in sequence.
   * Returns the market PDA.
   */
  async createMarketFull(
    creator: PublicKey,
    collateralMint: PublicKey,
    creatorFeeAccount: PublicKey,
    resolverPubkeys: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey, PublicKey, PublicKey, PublicKey],
    params: CreateMarketParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<PublicKey> {
    const { marketPda } = await this.createMarket(
      creator, collateralMint, creatorFeeAccount, params, opts
    );
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
   * Fetches `market.outcomeCount` and passes `2 * outcomeCount` remaining accounts:
   * `[outcome_mint_i, user_ata_i]` for each active outcome.
   * Creates any missing outcome ATAs for `user` before sending the instruction.
   * `platformTreasuryWallet` must match GlobalConfig.platformTreasury. The treasury
   * ATA for this collateral mint must already exist (create it client-side if needed).
   * Pass `collateralTokenProgram` as TOKEN_2022_PROGRAM_ID for Token-2022 mints.
   */
  async mintCompleteSet(
    user: PublicKey,
    marketPda: PublicKey,
    collateralMint: PublicKey,
    userCollateralAccount: PublicKey,
    platformTreasuryWallet: PublicKey,
    creatorFeeAccount: PublicKey,
    params: MintCompleteSetParams,
    opts?: anchor.web3.ConfirmOptions,
    collateralTokenProgram: PublicKey = TOKEN_PROGRAM_ID,
  ): Promise<string> {
    const market = await this.fetchMarket(marketPda);
    const oc = market.outcomeCount as number | BN;
    const n = BN.isBN(oc) ? oc.toNumber() : Number(oc);
    const outcomeMints = deriveAllOutcomeMints(this.program.programId, marketPda).slice(0, n);
    const userOutcomes = outcomeMints.map((m) =>
      getAssociatedTokenAddressSync(m, user, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    );
    const platformTreasuryAta = getAssociatedTokenAddressSync(
      collateralMint, platformTreasuryWallet, false, collateralTokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID
    );

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
        vault: deriveVault(this.program.programId, marketPda),
        collateralMint,
        userCollateralAccount,
        creatorFeeAccount,
        globalConfig: this.globalConfig,
        allowedMint: deriveAllowedMint(this.program.programId, collateralMint),
        platformTreasuryWallet,
        platformTreasuryAta,
        collateralTokenProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as AnyAccounts)
      .remainingAccounts(remainingAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /**
   * Burn one complete set (10^decimals base units of each outcome) and receive
   * the same amount of collateral base units back.
   */
  async redeemCompleteSet(
    user: PublicKey,
    marketPda: PublicKey,
    collateralMint: PublicKey,
    userCollateralAccount: PublicKey,
    params: RedeemCompleteSetParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    const outcomeMints = deriveAllOutcomeMints(this.program.programId, marketPda);
    const userOutcomes = outcomeMints.map((m) =>
      getAssociatedTokenAddressSync(m, user, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    );

    return this.program.methods
      .redeemCompleteSet({ marketId: params.marketId })
      .accounts({
        user,
        market: marketPda,
        vault: deriveVault(this.program.programId, marketPda),
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
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  // ─── Resolution ─────────────────────────────────────────────────────────────

  /**
   * Resolver casts a vote for an outcome. Fails if they already have an active vote;
   * call `revokeResolutionVote` first to change outcome (tally 1 → 0 → 1).
   */
  async voteResolution(
    marketPda: PublicKey,
    params: VoteResolutionParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    const resolverPdas = deriveAllResolvers(this.program.programId, marketPda);
    const votePda = deriveResolutionVote(this.program.programId, marketPda, params.resolverIndex);
    const tallyPda = deriveOutcomeTally(
      this.program.programId,
      marketPda,
      params.outcomeIndex
    );

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
        outcomeTally: tallyPda,
        resolver0: resolverPdas[0],
        resolver1: resolverPdas[1],
        resolver2: resolverPdas[2],
        resolver3: resolverPdas[3],
        resolver4: resolverPdas[4],
        resolver5: resolverPdas[5],
        resolver6: resolverPdas[6],
        resolver7: resolverPdas[7],
        systemProgram: SystemProgram.programId,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /** Clears the resolver’s active vote and decrements that outcome’s on-chain tally. */
  async revokeResolutionVote(
    marketPda: PublicKey,
    params: RevokeResolutionVoteParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    const resolverPdas = deriveAllResolvers(this.program.programId, marketPda);
    const votePda = deriveResolutionVote(this.program.programId, marketPda, params.resolverIndex);
    const tallyPda = deriveOutcomeTally(
      this.program.programId,
      marketPda,
      params.outcomeIndex
    );

    return this.program.methods
      .revokeResolutionVote({
        marketId: params.marketId,
        resolverIndex: params.resolverIndex,
        outcomeIndex: params.outcomeIndex,
      })
      .accounts({
        resolverSigner: this.walletKey,
        market: marketPda,
        resolutionVote: votePda,
        outcomeTally: tallyPda,
        resolver0: resolverPdas[0],
        resolver1: resolverPdas[1],
        resolver2: resolverPdas[2],
        resolver3: resolverPdas[3],
        resolver4: resolverPdas[4],
        resolver5: resolverPdas[5],
        resolver6: resolverPdas[6],
        resolver7: resolverPdas[7],
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /**
   * Anyone can call `finalizeResolution`. It is a no-op if the threshold is
   * not yet reached; resolves the market once M votes agree on one outcome.
   * Passes optional per-outcome tally accounts (null if that tally PDA was never created).
   */
  async finalizeResolution(
    marketPda: PublicKey,
    params: FinalizeResolutionParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    const tallies = deriveAllOutcomeTallies(this.program.programId, marketPda);
    const infos = await Promise.all(
      tallies.map((p) => this.connection.getAccountInfo(p))
    );

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
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /**
   * Burn `amount` winning outcome token base units and receive the same
   * amount of collateral base units from the vault.
   * `platformTreasuryWallet` is the wallet address from GlobalConfig — fetched
   * automatically from on-chain state if not provided.
   */
  async redeemWinning(
    user: PublicKey,
    marketPda: PublicKey,
    collateralMint: PublicKey,
    userCollateralAccount: PublicKey,
    params: RedeemWinningParams,
    opts?: anchor.web3.ConfirmOptions,
    platformTreasuryWallet?: PublicKey,
  ): Promise<string> {
    const [market, config] = await Promise.all([
      this.fetchMarket(marketPda),
      platformTreasuryWallet ? Promise.resolve(null) : this.fetchGlobalConfig(),
    ]);
    const treasuryWallet = platformTreasuryWallet ?? config!.platformTreasury;

    const outcomeMints = deriveAllOutcomeMints(this.program.programId, marketPda);
    const winningIndex = market.resolvedOutcomeIndex!;
    const userWinningOutcome = getAssociatedTokenAddressSync(
      outcomeMints[winningIndex], user, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );

    return this.program.methods
      .redeemWinning({ marketId: params.marketId, amount: params.amount })
      .accounts({
        user,
        market: marketPda,
        vault: deriveVault(this.program.programId, marketPda),
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
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  // ─── Market lifecycle ────────────────────────────────────────────────────────

  /** Creator or any resolver can close the market before `close_at`. */
  async closeMarketEarly(
    marketPda: PublicKey,
    params: CloseMarketEarlyParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    const resolverPdas = deriveAllResolvers(this.program.programId, marketPda);

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
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /** Void the market (cancel); enables full-set redemption for all holders. */
  async voidMarket(
    marketPda: PublicKey,
    params: VoidMarketParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    const resolverPdas = deriveAllResolvers(this.program.programId, marketPda);

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
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  // ─── State readers ───────────────────────────────────────────────────────────

  async fetchGlobalConfig(): Promise<GlobalConfigAccount> {
    return this.program.account.globalConfig.fetch(this.globalConfig) as Promise<GlobalConfigAccount>;
  }

  async fetchMarket(market: PublicKey): Promise<MarketAccount> {
    return this.program.account.market.fetch(market) as Promise<MarketAccount>;
  }

  /** Returns the collateral balance (base units) held in the vault. */
  async fetchVaultBalance(market: PublicKey): Promise<bigint> {
    const vault = deriveVault(this.program.programId, market);
    const acc = await getAccount(this.connection, vault, undefined, TOKEN_PROGRAM_ID);
    return acc.amount;
  }

  /** Returns the outcome token balance (base units) for a user and outcome index. */
  async fetchOutcomeBalance(
    market: PublicKey,
    user: PublicKey,
    outcomeIndex: number
  ): Promise<bigint> {
    const mint = deriveOutcomeMint(this.program.programId, market, outcomeIndex);
    const ata = getAssociatedTokenAddressSync(
      mint, user, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const acc = await getAccount(this.connection, ata, undefined, TOKEN_PROGRAM_ID);
    return acc.amount;
  }

  // ─── User profiles ───────────────────────────────────────────────────────────

  /**
   * Create or update the caller's on-chain user profile.
   * The PDA `["user-profile", wallet]` is initialized on first call (payer = wallet);
   * subsequent calls update `display_name` and `url` without resetting the `verified` flag.
   */
  async upsertUserProfile(
    params: UpsertUserProfileParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    return this.program.methods
      .upsertUserProfile(params.displayName, params.url)
      .accounts({
        userProfile: deriveUserProfile(this.program.programId, this.walletKey),
        wallet: this.walletKey,
        systemProgram: SystemProgram.programId,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /**
   * Close the caller's user profile, reclaiming the rent lamports.
   * The profile PDA is zeroed and lamports are returned to the wallet.
   */
  async closeUserProfile(
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    return this.program.methods
      .closeUserProfile()
      .accounts({
        userProfile: deriveUserProfile(this.program.programId, this.walletKey),
        wallet: this.walletKey,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /**
   * Set or revoke the `verified` flag on any user's profile.
   * Only callable by the platform primary or secondary authority (stored in GlobalConfig).
   *
   * @param targetWallet - The wallet whose profile to update.
   * @param params       - `{ verified: boolean }` — true to verify, false to revoke.
   */
  async verifyUserProfile(
    targetWallet: PublicKey,
    params: VerifyUserProfileParams,
    opts?: anchor.web3.ConfirmOptions
  ): Promise<string> {
    return this.program.methods
      .verifyUserProfile(params.verified)
      .accounts({
        userProfile: deriveUserProfile(this.program.programId, targetWallet),
        targetWallet,
        authority: this.walletKey,
        globalConfig: this.globalConfig,
      } as AnyAccounts)
      .rpc(opts ?? { skipPreflight: true });
  }

  /**
   * Fetch a user's on-chain profile. Returns `null` if the profile has never
   * been created (or has been closed).
   */
  async fetchUserProfile(wallet: PublicKey): Promise<UserProfileAccount | null> {
    const pda = deriveUserProfile(this.program.programId, wallet);
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;
    return this.program.account.userProfile.fetch(pda) as Promise<UserProfileAccount>;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private async _ensureAtas(
    owner: PublicKey,
    mints: PublicKey[],
    atas: PublicKey[]
  ): Promise<void> {
    const checks = await Promise.all(
      atas.map((ata) => this.connection.getAccountInfo(ata).then((info) => info === null))
    );
    const missing = mints
      .map((mint, i) => ({ mint, ata: atas[i], create: checks[i] }))
      .filter((x) => x.create)
      .map((x) =>
        createAssociatedTokenAccountInstruction(
          this.walletKey, x.ata, owner, x.mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );

    if (missing.length === 0) return;
    const tx = new Transaction().add(...missing);
    const wallet = (this.program.provider as anchor.AnchorProvider).wallet;
    await sendAndConfirmTransaction(
      this.connection,
      tx,
      [{ publicKey: wallet.publicKey, signTransaction: wallet.signTransaction.bind(wallet), signAllTransactions: wallet.signAllTransactions.bind(wallet) } as any],
      { skipPreflight: true }
    );
  }
}
