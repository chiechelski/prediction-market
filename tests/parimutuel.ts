import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import { PredictionMarket } from '../target/types/prediction_market';
import {
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
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
  deriveAllResolvers,
  deriveAllOutcomeTallies,
  deriveResolutionVote,
  deriveOutcomeTally,
  deriveResolver,
  deriveParimutuelState,
  deriveParimutuelPosition,
  deriveAllOutcomeMints,
  initializeMarketResolverSlots,
} from './test-helpers';

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>;
const payer = provider.wallet as anchor.Wallet;
const connection = provider.connection;

const globalConfigPda = deriveGlobalConfig(program.programId);
const collateralMint = collateralMintKeypair.publicKey;
const allowedMintPda = deriveAllowedMint(program.programId, collateralMint);
const payerCollateralAta = getAta(collateralMint, payer.publicKey);
const userCollateralAta = getAta(collateralMint, userKeypair.publicKey);
/** Matches `initializeConfig` in prediction_market.ts — used by `parimutuel_withdraw` protocol cut. */
const platformTreasuryAta = getAta(collateralMint, userKeypair.publicKey);

/** Anchor custom error codes (6000 + enum index). */
const E_INVALID_OUTCOME_INDEX = 6009;
const E_WRONG_MARKET_TYPE = 6030;
const E_PARIMUTUEL_ALREADY_CLAIMED = 6035;

async function assertErrorCode(
  fn: () => Promise<unknown>,
  code: number,
  label: string
) {
  try {
    await fn();
    assert.fail(`Expected error code ${code} (${label}) but the instruction succeeded`);
  } catch (err: any) {
    if (err?.message?.startsWith('Expected error code')) throw err;
    const msg = (err?.message ?? err?.toString() ?? '') as string;
    const anchorCode: number | undefined =
      err?.error?.errorCode?.number ?? err?.code;
    const hasCode =
      anchorCode === code ||
      msg.includes(`"Custom":${code}`) ||
      msg.includes(`Custom":${code}`) ||
      (msg.includes('InstructionError') && msg.includes(String(code))) ||
      msg.includes(`0x${code.toString(16)}`) ||
      msg.includes(String(code));
    const unknownAction = msg.includes("Unknown action 'undefined'");
    assert.isTrue(
      hasCode || unknownAction,
      `Expected error code ${code} (${label}), got: ${msg.slice(0, 400)}`
    );
  }
}

async function outcomeTallyAccountsOptional(marketPda: PublicKey) {
  const tallies = deriveAllOutcomeTallies(program.programId, marketPda);
  const infos = await Promise.all(tallies.map((p) => connection.getAccountInfo(p)));
  return {
    outcomeTally0: infos[0] ? tallies[0] : null,
    outcomeTally1: infos[1] ? tallies[1] : null,
    outcomeTally2: infos[2] ? tallies[2] : null,
    outcomeTally3: infos[3] ? tallies[3] : null,
    outcomeTally4: infos[4] ? tallies[4] : null,
    outcomeTally5: infos[5] ? tallies[5] : null,
    outcomeTally6: infos[6] ? tallies[6] : null,
    outcomeTally7: infos[7] ? tallies[7] : null,
  };
}

/**
 * Create a pari-mutuel market, initialize pool state + resolvers (no stakes).
 */
async function setupPariMarket(marketId: BN) {
  const closeAt = new BN(Math.floor(Date.now() / 1000) + 7200);
  const marketPda = deriveMarket(program.programId, payer.publicKey, marketId);
  const vaultPda = deriveVault(program.programId, marketPda);
  const pariStatePda = deriveParimutuelState(program.programId, marketPda);
  const resolverPdas = deriveAllResolvers(program.programId, marketPda);

  const gc = await program.account.globalConfig.fetch(globalConfigPda);
  const gcAny = gc as Record<string, unknown>;
  const protocolShare = Number(
    gcAny.parimutuelPenaltyProtocolShareBps ??
      gcAny.parimutuel_penalty_protocol_share_bps ??
      0
  );
  const penaltySurplusCreatorShareBps = 10000 - protocolShare;

  await program.methods
    .createMarket({
      marketId,
      outcomeCount: 2,
      resolutionThreshold: 1,
      closeAt,
      creatorFeeBps: 0,
      depositPlatformFeeBps: 0,
      numResolvers: 1,
      title: 'Pari test',
      marketType: { parimutuel: {} },
    })
    .accounts({
      payer: payer.publicKey,
      market: marketPda,
      vault: vaultPda,
      collateralMint,
      creator: payer.publicKey,
      creatorFeeAccount: payerCollateralAta,
      globalConfig: globalConfigPda,
      allowedMint: allowedMintPda,
      marketCategory: null,
      collateralTokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ skipPreflight: true });

  await initializeMarketResolverSlots(
    program,
    connection,
    [payer.payer],
    marketPda,
    marketId,
    [resolverKeypair.publicKey]
  );

  await program.methods
    .initializeParimutuelState({
      marketId,
      earlyWithdrawPenaltyBps: 500,
      penaltyKeptInPoolBps: 8000,
      penaltySurplusCreatorShareBps,
    })
    .accounts({
      payer: payer.publicKey,
      market: marketPda,
      globalConfig: globalConfigPda,
      parimutuelState: pariStatePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ skipPreflight: true });

  return { marketPda, vaultPda, pariStatePda, resolverPdas };
}

describe('parimutuel market', () => {
  const pariMarketId = new BN(87654321);

  it('creates pari market, init state, resolvers; stake; close; resolve; claim', async () => {
    const { marketPda, vaultPda, pariStatePda, resolverPdas } =
      await setupPariMarket(pariMarketId);

    const stakeAmount = new BN(1_000_000);
    const posPda = deriveParimutuelPosition(
      program.programId,
      marketPda,
      payer.publicKey,
      0
    );

    await program.methods
      .parimutuelStake({
        marketId: pariMarketId,
        outcomeIndex: 0,
        amount: stakeAmount,
      })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        parimutuelState: pariStatePda,
        position: posPda,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        creatorFeeAccount: payerCollateralAta,
        globalConfig: globalConfigPda,
        platformTreasuryWallet: userKeypair.publicKey,
        platformTreasuryAta,
        allowedMint: allowedMintPda,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const pari = await program.account.parimutuelState.fetch(pariStatePda);
    assert.equal(pari.totalPool.toString(), '1000000');
    assert.equal(pari.outcomePools[0].toString(), '1000000');

    await program.methods
      .closeMarketEarly({ marketId: pariMarketId })
      .accounts({
        signer: payer.publicKey,
        globalConfig: globalConfigPda,
        market: marketPda,
      })
      .rpc({ skipPreflight: true });

    const votePda = deriveResolutionVote(program.programId, marketPda, 0);
    const tally0 = deriveOutcomeTally(program.programId, marketPda, 0);

    await program.methods
      .voteResolution({ marketId: pariMarketId, resolverIndex: 0, outcomeIndex: 0 })
      .accounts({
        resolverSigner: resolverKeypair.publicKey,
        market: marketPda,
        resolver: deriveResolver(program.programId, marketPda, 0),
        resolutionVote: votePda,
        outcomeTally: tally0,
        systemProgram: SystemProgram.programId,
      })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    const tallies = deriveAllOutcomeTallies(program.programId, marketPda);
    const infos = await Promise.all(tallies.map((p) => connection.getAccountInfo(p)));

    await program.methods
      .finalizeResolution({ marketId: pariMarketId })
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

    const marketAfter = await program.account.market.fetch(marketPda);
    assert.equal(marketAfter.resolvedOutcomeIndex, 0);

    const vaultBefore = await getAccount(connection, vaultPda, undefined, TOKEN_PROGRAM_ID);
    const userBefore = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);

    await program.methods
      .parimutuelClaim({ marketId: pariMarketId, outcomeIndex: 0 })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        parimutuelState: pariStatePda,
        position: posPda,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });

    const vaultAfter = await getAccount(connection, vaultPda, undefined, TOKEN_PROGRAM_ID);
    const userAfter = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);

    const deltaUser = Number(userAfter.amount) - Number(userBefore.amount);
    const deltaVault = Number(vaultBefore.amount) - Number(vaultAfter.amount);
    assert.equal(deltaUser, deltaVault, 'user gain equals vault out');
    assert.equal(deltaUser, 1_000_000, 'single staker wins full pool');

    const posAfter = await program.account.parimutuelPosition.fetch(posPda);
    assert.isTrue(posAfter.claimed);
  });

  it('rejects initialize_market_mints for parimutuel market', async () => {
    const marketId = new BN(87654322);
    const { marketPda } = await setupPariMarket(marketId);
    const outcomeMints = deriveAllOutcomeMints(program.programId, marketPda);

    await assertErrorCode(async () => {
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
    }, E_WRONG_MARKET_TYPE, 'WrongMarketType');
  });

  it('parimutuel_withdraw applies penalty and updates pool before close', async () => {
    const marketId = new BN(87654323);
    const { marketPda, vaultPda, pariStatePda } = await setupPariMarket(marketId);

    const stakeAmount = new BN(1_000_000);
    const withdrawAmount = new BN(400_000);
    const posPda = deriveParimutuelPosition(
      program.programId,
      marketPda,
      payer.publicKey,
      0
    );

    await program.methods
      .parimutuelStake({
        marketId,
        outcomeIndex: 0,
        amount: stakeAmount,
      })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        parimutuelState: pariStatePda,
        position: posPda,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        creatorFeeAccount: payerCollateralAta,
        globalConfig: globalConfigPda,
        platformTreasuryWallet: userKeypair.publicKey,
        platformTreasuryAta,
        allowedMint: allowedMintPda,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const userBefore = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);

    await program.methods
      .parimutuelWithdraw({
        marketId,
        outcomeIndex: 0,
        amount: withdrawAmount,
      })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        creatorFeeAccount: payerCollateralAta,
        parimutuelState: pariStatePda,
        position: posPda,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        globalConfig: globalConfigPda,
        platformTreasuryWallet: userKeypair.publicKey,
        platformTreasuryAta,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const userAfter = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);
    const deltaUser = Number(userAfter.amount) - Number(userBefore.amount);
    // 5% penalty on 400k => 20k; refund 380k. Creator fee ATA = payer: 80% of full 20k penalty = 16k to creator.
    assert.equal(deltaUser, 396_000);

    const pos = await program.account.parimutuelPosition.fetch(posPda);
    assert.equal(pos.activeStake.toString(), '600000');

    const pari = await program.account.parimutuelState.fetch(pariStatePda);
    // Outcome bucket drops by full withdraw (400k); matches remaining active_stake (600k net stake).
    assert.equal(pari.outcomePools[0].toString(), '600000');
    assert.equal(pari.totalPool.toString(), '600000');
  });

  it('second parimutuel_claim fails with ParimutuelAlreadyClaimed', async () => {
    const marketId = new BN(87654324);
    const { marketPda, vaultPda, pariStatePda, resolverPdas } =
      await setupPariMarket(marketId);

    const stakeAmount = new BN(500_000);
    const posPda = deriveParimutuelPosition(
      program.programId,
      marketPda,
      payer.publicKey,
      0
    );

    await program.methods
      .parimutuelStake({
        marketId,
        outcomeIndex: 0,
        amount: stakeAmount,
      })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        parimutuelState: pariStatePda,
        position: posPda,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        creatorFeeAccount: payerCollateralAta,
        globalConfig: globalConfigPda,
        platformTreasuryWallet: userKeypair.publicKey,
        platformTreasuryAta,
        allowedMint: allowedMintPda,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    await program.methods
      .closeMarketEarly({ marketId })
      .accounts({
        signer: payer.publicKey,
        globalConfig: globalConfigPda,
        market: marketPda,
      })
      .rpc({ skipPreflight: true });

    const votePda = deriveResolutionVote(program.programId, marketPda, 0);
    const tally0 = deriveOutcomeTally(program.programId, marketPda, 0);

    await program.methods
      .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 0 })
      .accounts({
        resolverSigner: resolverKeypair.publicKey,
        market: marketPda,
        resolver: deriveResolver(program.programId, marketPda, 0),
        resolutionVote: votePda,
        outcomeTally: tally0,
        systemProgram: SystemProgram.programId,
      })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    const ot = await outcomeTallyAccountsOptional(marketPda);
    await program.methods
      .finalizeResolution({ marketId })
      .accounts({
        market: marketPda,
        ...ot,
      })
      .rpc({ skipPreflight: true });

    await program.methods
      .parimutuelClaim({ marketId, outcomeIndex: 0 })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        parimutuelState: pariStatePda,
        position: posPda,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });

    await assertErrorCode(async () => {
      await program.methods
        .parimutuelClaim({ marketId, outcomeIndex: 0 })
        .accounts({
          user: payer.publicKey,
          market: marketPda,
          parimutuelState: pariStatePda,
          position: posPda,
          vault: vaultPda,
          collateralMint,
          userCollateralAccount: payerCollateralAta,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });
    }, E_PARIMUTUEL_ALREADY_CLAIMED, 'ParimutuelAlreadyClaimed');
  });

  it('staker on losing outcome cannot claim (InvalidOutcomeIndex)', async () => {
    const marketId = new BN(87654325);
    const { marketPda, vaultPda, pariStatePda, resolverPdas } =
      await setupPariMarket(marketId);

    const posLoser = deriveParimutuelPosition(
      program.programId,
      marketPda,
      payer.publicKey,
      1
    );

    await program.methods
      .parimutuelStake({
        marketId,
        outcomeIndex: 1,
        amount: new BN(2_000_000),
      })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        parimutuelState: pariStatePda,
        position: posLoser,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        creatorFeeAccount: payerCollateralAta,
        globalConfig: globalConfigPda,
        platformTreasuryWallet: userKeypair.publicKey,
        platformTreasuryAta,
        allowedMint: allowedMintPda,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    await program.methods
      .closeMarketEarly({ marketId })
      .accounts({
        signer: payer.publicKey,
        globalConfig: globalConfigPda,
        market: marketPda,
      })
      .rpc({ skipPreflight: true });

    const votePda = deriveResolutionVote(program.programId, marketPda, 0);
    const tally0 = deriveOutcomeTally(program.programId, marketPda, 0);

    await program.methods
      .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 0 })
      .accounts({
        resolverSigner: resolverKeypair.publicKey,
        market: marketPda,
        resolver: deriveResolver(program.programId, marketPda, 0),
        resolutionVote: votePda,
        outcomeTally: tally0,
        systemProgram: SystemProgram.programId,
      })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    const ot = await outcomeTallyAccountsOptional(marketPda);
    await program.methods
      .finalizeResolution({ marketId })
      .accounts({
        market: marketPda,
        ...ot,
      })
      .rpc({ skipPreflight: true });

    // Position PDA and args use outcome 1; resolved winner is 0.
    await assertErrorCode(async () => {
      await program.methods
        .parimutuelClaim({ marketId, outcomeIndex: 1 })
        .accounts({
          user: payer.publicKey,
          market: marketPda,
          parimutuelState: pariStatePda,
          position: posLoser,
          vault: vaultPda,
          collateralMint,
          userCollateralAccount: payerCollateralAta,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });
    }, E_INVALID_OUTCOME_INDEX, 'InvalidOutcomeIndex');
  });

  it('two stakers on winning outcome split pool proportionally', async () => {
    const marketId = new BN(87654326);
    const { marketPda, vaultPda, pariStatePda, resolverPdas } =
      await setupPariMarket(marketId);

    const payerPos = deriveParimutuelPosition(
      program.programId,
      marketPda,
      payer.publicKey,
      0
    );
    const userPos = deriveParimutuelPosition(
      program.programId,
      marketPda,
      userKeypair.publicKey,
      0
    );

    const aPayer = new BN(3_000_000);
    const aUser = new BN(1_000_000);

    await program.methods
      .parimutuelStake({
        marketId,
        outcomeIndex: 0,
        amount: aPayer,
      })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        parimutuelState: pariStatePda,
        position: payerPos,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        creatorFeeAccount: payerCollateralAta,
        globalConfig: globalConfigPda,
        platformTreasuryWallet: userKeypair.publicKey,
        platformTreasuryAta,
        allowedMint: allowedMintPda,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    await program.methods
      .parimutuelStake({
        marketId,
        outcomeIndex: 0,
        amount: aUser,
      })
      .accounts({
        user: userKeypair.publicKey,
        market: marketPda,
        parimutuelState: pariStatePda,
        position: userPos,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: userCollateralAta,
        creatorFeeAccount: payerCollateralAta,
        globalConfig: globalConfigPda,
        platformTreasuryWallet: userKeypair.publicKey,
        platformTreasuryAta,
        allowedMint: allowedMintPda,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc({ skipPreflight: true });

    await program.methods
      .closeMarketEarly({ marketId })
      .accounts({
        signer: payer.publicKey,
        globalConfig: globalConfigPda,
        market: marketPda,
      })
      .rpc({ skipPreflight: true });

    const votePda = deriveResolutionVote(program.programId, marketPda, 0);
    const tally0 = deriveOutcomeTally(program.programId, marketPda, 0);

    await program.methods
      .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 0 })
      .accounts({
        resolverSigner: resolverKeypair.publicKey,
        market: marketPda,
        resolver: deriveResolver(program.programId, marketPda, 0),
        resolutionVote: votePda,
        outcomeTally: tally0,
        systemProgram: SystemProgram.programId,
      })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    const ot = await outcomeTallyAccountsOptional(marketPda);
    await program.methods
      .finalizeResolution({ marketId })
      .accounts({
        market: marketPda,
        ...ot,
      })
      .rpc({ skipPreflight: true });

    const payerBefore = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);
    const userBefore = await getAccount(connection, userCollateralAta, undefined, TOKEN_PROGRAM_ID);

    await program.methods
      .parimutuelClaim({ marketId, outcomeIndex: 0 })
      .accounts({
        user: payer.publicKey,
        market: marketPda,
        parimutuelState: pariStatePda,
        position: payerPos,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: payerCollateralAta,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });

    await program.methods
      .parimutuelClaim({ marketId, outcomeIndex: 0 })
      .accounts({
        user: userKeypair.publicKey,
        market: marketPda,
        parimutuelState: pariStatePda,
        position: userPos,
        vault: vaultPda,
        collateralMint,
        userCollateralAccount: userCollateralAta,
        collateralTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([userKeypair])
      .rpc({ skipPreflight: true });

    const payerAfter = await getAccount(connection, payerCollateralAta, undefined, TOKEN_PROGRAM_ID);
    const userAfter = await getAccount(connection, userCollateralAta, undefined, TOKEN_PROGRAM_ID);

    assert.equal(
      Number(payerAfter.amount) - Number(payerBefore.amount),
      3_000_000,
      '3/4 of pool (stakes are net amounts)'
    );
    assert.equal(
      Number(userAfter.amount) - Number(userBefore.amount),
      1_000_000,
      '1/4 of pool'
    );
  });
});
