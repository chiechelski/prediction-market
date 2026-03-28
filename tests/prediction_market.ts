import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import { PredictionMarket } from '../target/types/prediction_market';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getMintLen,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { assert } from 'chai';
import {
  collateralMintKeypair,
  resolverKeypair,
  userKeypair,
  COLLATERAL_DECIMALS,
  getAta,
  deriveGlobalConfig,
  deriveAllowedMint,
  deriveMarket,
  deriveVault,
  deriveAllOutcomeMints,
  deriveAllOutcomeTallies,
  deriveAllResolvers,
  deriveOutcomeTally,
  deriveResolutionVote,
  deriveMarketCategory,
} from './test-helpers';

// ─── Shared test state ───────────────────────────────────────────────────────

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>;
const payer = provider.wallet as anchor.Wallet;
const connection = provider.connection;

const PLATFORM_FEE_BPS = 100; // 1%
const CREATOR_FEE_BPS = 50;   // 0.5%

// Deterministic market id (hash of a fixed string for reproducibility)
const marketId = new BN(12345678);

// PDAs
const globalConfigPda = deriveGlobalConfig(program.programId);
const collateralMint = collateralMintKeypair.publicKey;
const allowedMintPda = deriveAllowedMint(program.programId, collateralMint);
const marketPda = deriveMarket(program.programId, payer.publicKey, marketId);
const vaultPda = deriveVault(program.programId, marketPda);
const outcomeMints = deriveAllOutcomeMints(program.programId, marketPda);
const resolverPdas = deriveAllResolvers(program.programId, marketPda);

// ATAs (deterministic — derived at module load time)
const payerCollateralAta = getAta(collateralMint, payer.publicKey);
const userCollateralAta = getAta(collateralMint, userKeypair.publicKey);
// Use distinct accounts for each role to avoid AccountBorrowFailed on self-transfers:
//   user pays from payerCollateralAta, platform fee goes to user's ATA, creator fee to resolver's ATA
const platformTreasuryAta = getAta(collateralMint, userKeypair.publicKey);
const resolverCollateralAta = getAta(collateralMint, resolverKeypair.publicKey);
const creatorFeeAta = resolverCollateralAta;

// Per-outcome ATAs for the payer (user minting/redeeming)
const payerOutcomeAtas = outcomeMints.map((m) => getAta(m, payer.publicKey));

// ─── 1. Startup: airdrop + create SPL mint + create ATAs + mint collateral ──

describe('startup', () => {
  it('airdrops SOL to resolver and user keypairs', async () => {
    for (const kp of [resolverKeypair, userKeypair]) {
      const sig = await connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
      const lb = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...lb });
    }
  });

  it('creates collateral mint', async () => {
    const mintLen = getMintLen([]);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: collateralMint,
        space: mintLen,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        collateralMint,
        COLLATERAL_DECIMALS,
        payer.publicKey,
        null,
        TOKEN_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(connection, tx, [payer.payer, collateralMintKeypair], {
      skipPreflight: true,
    });
  });

  it('creates collateral ATAs and mints tokens to payer and user', async () => {
    const MINT_AMOUNT = 1_000_000_000 * 10 ** COLLATERAL_DECIMALS;

    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey, payerCollateralAta, payer.publicKey,
        collateralMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        payer.publicKey, userCollateralAta, userKeypair.publicKey,
        collateralMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        payer.publicKey, resolverCollateralAta, resolverKeypair.publicKey,
        collateralMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(
        collateralMint, payerCollateralAta, payer.publicKey,
        MINT_AMOUNT, [], TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(
        collateralMint, userCollateralAta, payer.publicKey,
        MINT_AMOUNT / 10, [], TOKEN_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(connection, tx, [payer.payer], { skipPreflight: true });

    const acc = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);
    assert.equal(Number(acc.amount), MINT_AMOUNT);
  });
});

// ─── 2. Admin: config + allowlist ────────────────────────────────────────────

describe('admin', () => {
  it('initializes global config', async () => {
    await program.methods
      .initializeConfig(
        payer.publicKey,
        PLATFORM_FEE_BPS,
        userKeypair.publicKey,
        new BN(0),
        2000,
        0
      )
      .accounts({
        globalConfig: globalConfigPda,
        authority: payer.publicKey,
        secondaryAuthority: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const cfg = await program.account.globalConfig.fetch(globalConfigPda);
    assert.equal(cfg.depositPlatformFeeBps, PLATFORM_FEE_BPS);
    const cfgAny = cfg as Record<string, unknown>;
    const pp = Number(
      cfgAny.parimutuelPenaltyProtocolShareBps ??
        cfgAny.parimutuel_penalty_protocol_share_bps ??
        -1
    );
    assert.equal(pp, 2000);
    assert.equal(cfg.platformTreasury.toBase58(), userKeypair.publicKey.toBase58());
  });

  it('adds collateral mint to allowlist', async () => {
    await program.methods
      .addAllowedCollateralMint()
      .accounts({
        allowedMint: allowedMintPda,
        globalConfig: globalConfigPda,
        authority: payer.publicKey,
        mint: collateralMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const allowed = await program.account.allowedMint.fetch(allowedMintPda);
    assert.equal(allowed.mint.toBase58(), collateralMint.toBase58());
  });

  it('updates global config fee', async () => {
    const newFee = 200;
    await program.methods
      .updateConfig(payer.publicKey, newFee, userKeypair.publicKey, new BN(0), 2000, 0)
      .accounts({
        globalConfig: globalConfigPda,
        authority: payer.publicKey,
        newAuthority: payer.publicKey,
      })
      .rpc({ skipPreflight: true });

    const cfg = await program.account.globalConfig.fetch(globalConfigPda);
    assert.equal(cfg.depositPlatformFeeBps, newFee);

    // reset back
    await program.methods
      .updateConfig(payer.publicKey, PLATFORM_FEE_BPS, userKeypair.publicKey, new BN(0), 2000, 0)
      .accounts({ globalConfig: globalConfigPda, authority: payer.publicKey, newAuthority: payer.publicKey })
      .rpc({ skipPreflight: true });
  });
});

// ─── 3. Market creation (3 steps) ────────────────────────────────────────────

describe('create market', () => {
  const category0 = deriveMarketCategory(program.programId, new BN(0));

  before(async () => {
    await program.methods
      .createMarketCategory(new BN(0), 'Crypto')
      .accounts({
        globalConfig: globalConfigPda,
        marketCategory: category0,
        authority: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });
  });

  it('step 1: creates market + vault', async () => {
    const closeAt = new BN(Math.floor(Date.now() / 1000) + 7200);

    await program.methods
      .createMarket({
        marketId,
        outcomeCount: 2,
        resolutionThreshold: 1,
        closeAt,
        creatorFeeBps: CREATOR_FEE_BPS,
        depositPlatformFeeBps: 0,
        numResolvers: 1,
        title: 'Happy path market',
        marketType: { completeSet: {} },
      })
      .accounts({
        payer: payer.publicKey,
        market: marketPda,
        vault: vaultPda,
        collateralMint,
        creator: payer.publicKey,
        creatorFeeAccount: creatorFeeAta,
        globalConfig: globalConfigPda,
        allowedMint: allowedMintPda,
        marketCategory: category0,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const market = await program.account.market.fetch(marketPda);
    assert.equal(market.outcomeCount, 2);
    assert.equal(market.title, 'Happy path market');
    assert.isTrue(market.category.equals(category0));
    assert.isFalse(market.closed);
    assert.isFalse(market.voided);
    assert.isNull(market.resolvedOutcomeIndex);
  });

  it('step 2: initializes resolver PDAs', async () => {
    const resolverPubkeys = [
      resolverKeypair.publicKey,
      ...Array(7).fill(PublicKey.default),
    ] as [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey, PublicKey, PublicKey, PublicKey];

    await program.methods
      .initializeMarketResolvers({
        marketId,
        resolverPubkeys,
        numResolvers: 1,
      })
      .accounts({
        payer: payer.publicKey,
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
      })
      .rpc({ skipPreflight: true });

    const r0 = await program.account.resolver.fetch(resolverPdas[0]);
    assert.equal(r0.resolverPubkey.toBase58(), resolverKeypair.publicKey.toBase58());
  });

  it('step 3: initializes outcome mints', async () => {
    await program.methods
      .initializeMarketMints({ marketId })
      .accounts({
        payer: payer.publicKey,
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
      })
      .rpc({ skipPreflight: true });
  });

  it('creates payer outcome ATAs', async () => {
    // Create an ATA for each of the 2 active outcome mints (and the remaining 6 for completeness)
    const instructions = outcomeMints.map((mint, i) =>
      createAssociatedTokenAccountInstruction(
        payer.publicKey, payerOutcomeAtas[i], payer.publicKey,
        mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );

    const tx = new Transaction().add(...instructions);
    await sendAndConfirmTransaction(connection, tx, [payer.payer], { skipPreflight: true });
  });
});

// ─── 4. Mint complete set ─────────────────────────────────────────────────────

describe('mint complete set', () => {
  const AMOUNT = new BN(10 * 10 ** COLLATERAL_DECIMALS); // 10 collateral tokens

  it('mints a complete set and deducts fees', async () => {
    const vaultBefore = await getAccount(connection, vaultPda, undefined, TOKEN_PROGRAM_ID);
    const payerBefore = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);

    const m = await program.account.market.fetch(marketPda);
    const n = BN.isBN(m.outcomeCount) ? (m.outcomeCount as BN).toNumber() : Number(m.outcomeCount);
    const mintRemaining = Array.from({ length: n }, (_, i) => [
      { pubkey: outcomeMints[i], isSigner: false, isWritable: true },
      { pubkey: payerOutcomeAtas[i], isSigner: false, isWritable: true },
    ]).flat();

    await program.methods
      .mintCompleteSet({ amount: AMOUNT, marketId })
      .accountsStrict({
        user: payer.publicKey,
        market: marketPda,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        creatorFeeAccount: creatorFeeAta,
        globalConfig: globalConfigPda,
        allowedMint: allowedMintPda,
        platformTreasuryWallet: userKeypair.publicKey,
        platformTreasuryAta,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(mintRemaining)
      .rpc({ skipPreflight: true });

    const platformFee = Math.floor((AMOUNT.toNumber() * PLATFORM_FEE_BPS) / 10000);
    const creatorFee = Math.floor((AMOUNT.toNumber() * CREATOR_FEE_BPS) / 10000);
    const net = AMOUNT.toNumber() - platformFee - creatorFee;

    // Vault should have received net collateral
    const vaultAfter = await getAccount(connection, vaultPda, undefined, TOKEN_PROGRAM_ID);
    assert.equal(
      Number(vaultAfter.amount) - Number(vaultBefore.amount),
      net,
      'vault should increase by net amount'
    );

    // User gets net outcome token base units for each active outcome (2 outcomes)
    for (let i = 0; i < 2; i++) {
      const ata = await getAccount(connection, payerOutcomeAtas[i], undefined, TOKEN_PROGRAM_ID);
      assert.equal(Number(ata.amount), net, `outcome ${i} ATA balance`);
    }
    // Inactive outcomes (2–7) should remain at 0
    for (let i = 2; i < 8; i++) {
      const ata = await getAccount(connection, payerOutcomeAtas[i], undefined, TOKEN_PROGRAM_ID);
      assert.equal(Number(ata.amount), 0, `outcome ${i} ATA should be 0`);
    }
  });
});

// ─── 5. Redeem complete set ────────────────────────────────────────────────────

describe('redeem complete set', () => {
  it('burns one of each outcome token and receives 1 collateral unit', async () => {
    const vaultBefore = await getAccount(connection, vaultPda, undefined, TOKEN_PROGRAM_ID);
    const payerBefore = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);
    const outcome0Before = await getAccount(connection, payerOutcomeAtas[0], undefined, TOKEN_PROGRAM_ID);

    await program.methods
      .redeemCompleteSet({ marketId })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        outcomeMint0: outcomeMints[0],
        outcomeMint1: outcomeMints[1],
        outcomeMint2: outcomeMints[2],
        outcomeMint3: outcomeMints[3],
        outcomeMint4: outcomeMints[4],
        outcomeMint5: outcomeMints[5],
        outcomeMint6: outcomeMints[6],
        outcomeMint7: outcomeMints[7],
        userOutcome0: payerOutcomeAtas[0],
        userOutcome1: payerOutcomeAtas[1],
        userOutcome2: payerOutcomeAtas[2],
        userOutcome3: payerOutcomeAtas[3],
        userOutcome4: payerOutcomeAtas[4],
        userOutcome5: payerOutcomeAtas[5],
        userOutcome6: payerOutcomeAtas[6],
        userOutcome7: payerOutcomeAtas[7],
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });

    const oneSet = 10 ** COLLATERAL_DECIMALS; // 1 complete set = 10^decimals outcome token base units
    const vaultAfter = await getAccount(connection, vaultPda, undefined, TOKEN_PROGRAM_ID);
    const payerAfter = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);

    assert.equal(Number(vaultBefore.amount) - Number(vaultAfter.amount), oneSet, 'vault decreases by 1 set worth');
    assert.equal(Number(payerAfter.amount) - Number(payerBefore.amount), oneSet, 'payer receives 1 set worth');

    // Each outcome token burned by one full set (10^decimals base units)
    const outcome0After = await getAccount(connection, payerOutcomeAtas[0], undefined, TOKEN_PROGRAM_ID);
    assert.equal(Number(outcome0Before.amount) - Number(outcome0After.amount), oneSet, 'outcome 0 burned 1 set worth');
  });
});

// ─── 6. Close market early ────────────────────────────────────────────────────

describe('close market early', () => {
  it('creator can close the market early', async () => {
    await program.methods
      .closeMarketEarly({ marketId })
      .accounts({
        signer: payer.publicKey,
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
      .rpc({ skipPreflight: true });

    const market = await program.account.market.fetch(marketPda);
    assert.isTrue(market.closed, 'market should be closed');
  });
});

// ─── 7. Resolution flow ───────────────────────────────────────────────────────

describe('resolution', () => {
  it('resolver votes for outcome 0', async () => {
    const votePda = deriveResolutionVote(program.programId, marketPda, 0);
    const tally0 = deriveOutcomeTally(program.programId, marketPda, 0);

    await program.methods
      .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 0 })
      .accountsStrict({
        resolverSigner: resolverKeypair.publicKey,
        market: marketPda,
        resolver0: resolverPdas[0],
        resolver1: resolverPdas[1],
        resolver2: resolverPdas[2],
        resolver3: resolverPdas[3],
        resolver4: resolverPdas[4],
        resolver5: resolverPdas[5],
        resolver6: resolverPdas[6],
        resolver7: resolverPdas[7],
        resolutionVote: votePda,
        outcomeTally: tally0,
        systemProgram: SystemProgram.programId,
      })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    const vote = await program.account.resolutionVote.fetch(votePda);
    assert.isTrue(vote.hasVoted);
    assert.equal(vote.outcomeIndex, 0);
    const tally = await program.account.outcomeTally.fetch(tally0);
    assert.equal(tally.count, 1);
  });

  it('finalizes resolution when threshold is met (outcome 0 wins)', async () => {
    const tallies = deriveAllOutcomeTallies(program.programId, marketPda);
    const infos = await Promise.all(tallies.map((p) => connection.getAccountInfo(p)));

    await program.methods
      .finalizeResolution({ marketId })
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
      .rpc({ skipPreflight: true });

    const market = await program.account.market.fetch(marketPda);
    assert.equal(market.resolvedOutcomeIndex, 0, 'market resolved to outcome 0');
  });
});

// ─── 8. Redeem winning ────────────────────────────────────────────────────────

describe('redeem winning', () => {
  it('redeems all remaining winning outcome tokens for collateral', async () => {
    // At this point the market is resolved (outcome 0 wins) and closed.
    // The payer has the outcome 0 tokens left from the earlier mint (minus 1 set redeemed).
    const winningBefore = await getAccount(connection, payerOutcomeAtas[0], undefined, TOKEN_PROGRAM_ID);
    const collateralBefore = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);
    const redeemAmount = new BN(Number(winningBefore.amount));

    await program.methods
      .redeemWinning({ marketId, amount: redeemAmount })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        globalConfig: globalConfigPda,
        platformTreasuryWallet: userKeypair.publicKey,
        outcomeMint0: outcomeMints[0],
        outcomeMint1: outcomeMints[1],
        outcomeMint2: outcomeMints[2],
        outcomeMint3: outcomeMints[3],
        outcomeMint4: outcomeMints[4],
        outcomeMint5: outcomeMints[5],
        outcomeMint6: outcomeMints[6],
        outcomeMint7: outcomeMints[7],
        userWinningOutcome: payerOutcomeAtas[0],
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const winningAfter = await getAccount(connection, payerOutcomeAtas[0], undefined, TOKEN_PROGRAM_ID);
    const collateralAfter = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);

    // All winning tokens burned
    assert.equal(Number(winningAfter.amount), 0, 'all winning tokens should be burned');

    // Collateral received = winning tokens burned (1 outcome token base unit = 1 collateral base unit)
    assert.equal(
      Number(collateralAfter.amount) - Number(collateralBefore.amount),
      redeemAmount.toNumber(),
      'collateral received equals winning tokens burned'
    );
  });
});

// ─── 9. Void market (separate market) ────────────────────────────────────────

describe('void market', () => {
  const voidMarketId = new BN(99999);
  const voidMarketPda = deriveMarket(program.programId, payer.publicKey, voidMarketId);
  const voidVaultPda = deriveVault(program.programId, voidMarketPda);
  const voidResolverPdas = deriveAllResolvers(program.programId, voidMarketPda);

  before(async () => {
    const closeAt = new BN(Math.floor(Date.now() / 1000) + 7200);

    await program.methods
      .createMarket({
        marketId: voidMarketId,
        outcomeCount: 2,
        resolutionThreshold: 1,
        closeAt,
        creatorFeeBps: 0,
        depositPlatformFeeBps: 0,
        numResolvers: 1,
        title: 'Void test market',
        marketType: { completeSet: {} },
      })
      .accounts({
        payer: payer.publicKey,
        market: voidMarketPda,
        vault: voidVaultPda,
        collateralMint,
        creator: payer.publicKey,
        creatorFeeAccount: creatorFeeAta,
        globalConfig: globalConfigPda,
        allowedMint: allowedMintPda,
        marketCategory: null,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    await program.methods
      .initializeMarketResolvers({
        marketId: voidMarketId,
        resolverPubkeys: [resolverKeypair.publicKey, ...Array(7).fill(PublicKey.default)] as any,
        numResolvers: 1,
      })
      .accounts({
        payer: payer.publicKey,
        market: voidMarketPda,
        systemProgram: SystemProgram.programId,
        resolver0: voidResolverPdas[0],
        resolver1: voidResolverPdas[1],
        resolver2: voidResolverPdas[2],
        resolver3: voidResolverPdas[3],
        resolver4: voidResolverPdas[4],
        resolver5: voidResolverPdas[5],
        resolver6: voidResolverPdas[6],
        resolver7: voidResolverPdas[7],
      })
      .rpc({ skipPreflight: true });
  });

  it('creator can void the market', async () => {
    await program.methods
      .voidMarket({ marketId: voidMarketId })
      .accounts({
        signer: payer.publicKey,
        market: voidMarketPda,
        resolver0: voidResolverPdas[0],
        resolver1: voidResolverPdas[1],
        resolver2: voidResolverPdas[2],
        resolver3: voidResolverPdas[3],
        resolver4: voidResolverPdas[4],
        resolver5: voidResolverPdas[5],
        resolver6: voidResolverPdas[6],
        resolver7: voidResolverPdas[7],
      })
      .rpc({ skipPreflight: true });

    const market = await program.account.market.fetch(voidMarketPda);
    assert.isTrue(market.voided);
  });
});
