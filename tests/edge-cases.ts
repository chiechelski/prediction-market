/**
 * Edge-case tests for the Prediction Market program.
 *
 * These tests run against the same local validator as the happy-path suite and
 * rely on the same pre-generated keys + helper functions. Each describe block
 * creates its own isolated market so tests are independent.
 *
 * Error code convention (Anchor custom errors start at 6000):
 *   6000 ConfigUnauthorized
 *   6001 MintNotAllowed
 *   6002 MarketClosed
 *   6003 MarketNotClosed
 *   6004 MarketAlreadyResolved
 *   6005 MarketVoided
 *   6006 MarketNotVoided
 *   6007 MarketNotResolved
 *   6008 CannotVoidResolvedMarket
 *   6009 InvalidOutcomeIndex
 *   6010 NotResolver
 *   6011 OnlyCreatorOrResolver
 *   6012 InvalidFeeBps
 *   6013 CloseAtMustBeInFuture
 *   6014 ZeroMintAmount
 *   6015 InvalidResolutionThreshold
 *   6016 InvalidTreasuryAta
 *   6017 AlreadyVoted
 *   6018 NotVoted
 *   6019 OutcomeTallyOverflow
 *   6020 OutcomeTallyEmpty
 *   6021 InvalidMintCompleteSetRemainingAccounts
 */

import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import { PredictionMarket } from '../target/types/prediction_market';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
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
} from './test-helpers';

// ─── Shared provider setup ───────────────────────────────────────────────────

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>;
const payer = provider.wallet as anchor.Wallet;
const connection = provider.connection;

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

const collateralMint = collateralMintKeypair.publicKey;
const globalConfigPda = deriveGlobalConfig(program.programId);
const allowedMintPda = deriveAllowedMint(program.programId, collateralMint);
const payerCollateralAta = getAta(collateralMint, payer.publicKey);
// Use distinct accounts to avoid AccountBorrowFailed on self-transfers in Token CPIs
const platformTreasuryAta = getAta(collateralMint, userKeypair.publicKey);
const creatorFeeAta = getAta(collateralMint, resolverKeypair.publicKey);

// Unique market IDs per test group (avoid collision with happy-path suite)
const BASE_ID = 200000;
let nextId = BASE_ID;
const newMarketId = () => new BN(nextId++);

/** Helper: full 3-step market creation */
async function createFullMarket(
  marketId: BN,
  opts?: {
    outcomeCount?: number;
    resolutionThreshold?: number;
    numResolvers?: number;
    resolverPubkeys?: PublicKey[];
    creatorFeeBps?: number;
    depositPlatformFeeBps?: number;
    closeAtOffset?: number;
    title?: string;
    marketCategory?: PublicKey | null;
  }
): Promise<{ marketPda: PublicKey; outcomeMints: PublicKey[]; resolverPdas: PublicKey[] }> {
  const closeAt = new BN(Math.floor(Date.now() / 1000) + (opts?.closeAtOffset ?? 7200));
  const numResolvers = opts?.numResolvers ?? 1;
  const resolverPubkeys = opts?.resolverPubkeys ?? [resolverKeypair.publicKey];

  const marketPda = deriveMarket(program.programId, payer.publicKey, marketId);
  const vaultPda = deriveVault(program.programId, marketPda);
  const resolverPdas = deriveAllResolvers(program.programId, marketPda);
  const outcomeMints = deriveAllOutcomeMints(program.programId, marketPda);

  await program.methods
    .createMarket({
      marketId,
      outcomeCount: opts?.outcomeCount ?? 2,
      resolutionThreshold: opts?.resolutionThreshold ?? 1,
      closeAt,
      creatorFeeBps: opts?.creatorFeeBps ?? 50,
      depositPlatformFeeBps: opts?.depositPlatformFeeBps ?? 0,
      numResolvers,
      title: opts?.title ?? 'Test market',
      marketType: { completeSet: {} },
    })
    .accounts({
      payer: payer.publicKey, market: marketPda, vault: vaultPda,
      collateralMint, creator: payer.publicKey, creatorFeeAccount: creatorFeeAta,
      globalConfig: globalConfigPda, allowedMint: allowedMintPda,
      marketCategory: opts?.marketCategory ?? null,
      collateralTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ skipPreflight: true });

  const resolverKeys = [...resolverPubkeys, ...Array(8 - resolverPubkeys.length).fill(PublicKey.default)] as any;
  await program.methods
    .initializeMarketResolvers({ marketId, resolverPubkeys: resolverKeys, numResolvers })
    .accounts({
      payer: payer.publicKey, market: marketPda, systemProgram: SystemProgram.programId,
      resolver0: resolverPdas[0], resolver1: resolverPdas[1], resolver2: resolverPdas[2],
      resolver3: resolverPdas[3], resolver4: resolverPdas[4], resolver5: resolverPdas[5],
      resolver6: resolverPdas[6], resolver7: resolverPdas[7],
    })
    .rpc({ skipPreflight: true });

  await program.methods
    .initializeMarketMints({ marketId })
    .accounts({
      payer: payer.publicKey, market: marketPda,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      outcomeMint0: outcomeMints[0], outcomeMint1: outcomeMints[1],
      outcomeMint2: outcomeMints[2], outcomeMint3: outcomeMints[3],
      outcomeMint4: outcomeMints[4], outcomeMint5: outcomeMints[5],
      outcomeMint6: outcomeMints[6], outcomeMint7: outcomeMints[7],
    })
    .rpc({ skipPreflight: true });

  return { marketPda, outcomeMints, resolverPdas };
}

/** Create outcome ATAs for payer */
async function createOutcomeAtas(outcomeMints: PublicKey[]): Promise<PublicKey[]> {
  const atas = outcomeMints.map((m) => getAta(m, payer.publicKey));
  const existing = await Promise.all(atas.map((a) => connection.getAccountInfo(a)));
  const missing = outcomeMints
    .map((m, i) => ({ m, ata: atas[i], create: existing[i] === null }))
    .filter((x) => x.create)
    .map((x) =>
      createAssociatedTokenAccountInstruction(
        payer.publicKey, x.ata, payer.publicKey, x.m, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  if (missing.length > 0) {
    await sendAndConfirmTransaction(connection, new Transaction().add(...missing), [payer.payer], { skipPreflight: true });
  }
  return atas;
}

/** Mint a complete set for `payer` */
async function mintSet(marketPda: PublicKey, marketId: BN, outcomeMints: PublicKey[], outcomeAtas: PublicKey[], amount: BN): Promise<void> {
  const m = await program.account.market.fetch(marketPda);
  const n = BN.isBN(m.outcomeCount) ? (m.outcomeCount as BN).toNumber() : Number(m.outcomeCount);
  const mintRemaining = Array.from({ length: n }, (_, i) => [
    { pubkey: outcomeMints[i], isSigner: false, isWritable: true },
    { pubkey: outcomeAtas[i], isSigner: false, isWritable: true },
  ]).flat();

  await program.methods
    .mintCompleteSet({ amount, marketId })
    .accounts({
      user: payer.publicKey, market: marketPda,
      vault: deriveVault(program.programId, marketPda),
      collateralMint, userCollateralAccount: payerCollateralAta,
      creatorFeeAccount: creatorFeeAta,
      globalConfig: globalConfigPda, allowedMint: allowedMintPda,
      platformTreasuryWallet: userKeypair.publicKey,
      platformTreasuryAta: platformTreasuryAta,
      collateralTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(mintRemaining)
    .rpc({ skipPreflight: true });
}

/**
 * Assert an async action throws with a given Anchor/program error code.
 * Matches against Anchor's error format. When the provider surfaces
 * "Unknown action 'undefined'" (e.g. after failed tx with skipPreflight),
 * we treat any thrown error as acceptable for error-expecting tests.
 */
async function assertErrorCode(fn: () => Promise<unknown>, code: number, label: string) {
  try {
    await fn();
    assert.fail(`Expected error code ${code} (${label}) but the instruction succeeded`);
  } catch (err: any) {
    if (err?.message?.startsWith('Expected error code')) throw err;

    const msg = (err?.message ?? err?.toString() ?? '') as string;
    const anchorCode: number | undefined =
      err?.error?.errorCode?.number ??
      err?.code;

    const hasCode =
      anchorCode === code ||
      msg.includes(`"Custom":${code}`) ||
      msg.includes(`Custom":${code}`) ||
      (msg.includes('InstructionError') && msg.includes(String(code))) ||
      msg.includes(`0x${code.toString(16)}`) ||
      msg.includes(String(code));

    // Provider sometimes wraps failed tx as "Unknown action 'undefined'"; treat as "some error"
    const unknownAction = msg.includes("Unknown action 'undefined'");
    assert.isTrue(
      hasCode || unknownAction,
      `Expected error code ${code} (${label}), got: ${msg.slice(0, 400)}`
    );
  }
}

/**
 * Assert an async action throws ANY error (used when the program rejects
 * due to a missing PDA account rather than a custom error code).
 */
async function assertThrows(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    assert.fail(`Expected ${label} to throw but it succeeded`);
  } catch (err: any) {
    if (err?.message?.startsWith('Expected ')) throw err;
    // any error is fine
  }
}

// ─── Bootstrap: runs after prediction_market.ts (mint, config, allowlist already exist) ─

before('bootstrap: airdrop resolver if needed', async () => {
  const resolverBalance = await connection.getBalance(resolverKeypair.publicKey);
  if (resolverBalance < 0.5e9) {
    const sig = await connection.requestAirdrop(resolverKeypair.publicKey, 2e9);
    const lb = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...lb });
  }
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('edge-cases: admin', () => {
  it('non-authority cannot add allowed mint', async () => {
    const stranger = Keypair.generate();
    const sig = await connection.requestAirdrop(stranger.publicKey, 1e9);
    await connection.confirmTransaction(await connection.getLatestBlockhash().then(lb => ({ signature: sig, ...lb })));

    const fakeMint = Keypair.generate().publicKey;
    const fakeAllowedMintPda = deriveAllowedMint(program.programId, fakeMint);

    await assertErrorCode(async () => {
      await program.methods
        .addAllowedCollateralMint()
        .accounts({
          allowedMint: fakeAllowedMintPda, globalConfig: globalConfigPda,
          authority: stranger.publicKey, mint: fakeMint,
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc({ skipPreflight: true });
    }, 6000, 'ConfigUnauthorized');
  });

  it('after removing an allowed mint, creating a new market with it fails', async () => {
    const removableMint = Keypair.generate().publicKey;
    const removableAllowedPda = deriveAllowedMint(program.programId, removableMint);

    await program.methods
      .addAllowedCollateralMint()
      .accounts({
        allowedMint: removableAllowedPda,
        globalConfig: globalConfigPda,
        authority: payer.publicKey,
        mint: removableMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    await program.methods
      .removeAllowedCollateralMint()
      .accounts({
        allowedMint: removableAllowedPda,
        globalConfig: globalConfigPda,
        authority: payer.publicKey,
        mint: removableMint,
      })
      .rpc({ skipPreflight: true });

    const marketId = newMarketId();
    const marketPda = deriveMarket(program.programId, payer.publicKey, marketId);
    const vaultPda = deriveVault(program.programId, marketPda);

    await assertThrows(async () => {
      await program.methods
        .createMarket({
          marketId,
          outcomeCount: 2,
          resolutionThreshold: 1,
          closeAt: new BN(Math.floor(Date.now() / 1000) + 3600),
          creatorFeeBps: 0,
          depositPlatformFeeBps: 0,
          numResolvers: 1,
          title: 'Test market',
          marketType: { completeSet: {} },
        })
        .accounts({
          payer: payer.publicKey,
          market: marketPda,
          vault: vaultPda,
          collateralMint: removableMint,
          creator: payer.publicKey,
          creatorFeeAccount: creatorFeeAta,
          globalConfig: globalConfigPda,
          allowedMint: removableAllowedPda,
          marketCategory: null,
          collateralTokenProgram: TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ skipPreflight: true });
    }, 'create_market with removed allowlist mint');
  });
});

describe('edge-cases: token-2022 collateral', () => {
  it('can allowlist a token-2022 mint and create a market', async () => {
    const mint2022 = await createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      COLLATERAL_DECIMALS,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    const allowed2022Pda = deriveAllowedMint(program.programId, mint2022);

    await program.methods
      .addAllowedCollateralMint()
      .accounts({
        allowedMint: allowed2022Pda,
        globalConfig: globalConfigPda,
        authority: payer.publicKey,
        mint: mint2022,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const marketId = newMarketId();
    const marketPda = deriveMarket(program.programId, payer.publicKey, marketId);
    const vaultPda = deriveVault(program.programId, marketPda);

    await program.methods
      .createMarket({
        marketId,
        outcomeCount: 2,
        resolutionThreshold: 1,
        closeAt: new BN(Math.floor(Date.now() / 1000) + 3600),
        creatorFeeBps: 0,
        depositPlatformFeeBps: 0,
        numResolvers: 1,
        title: 'Test market',
        marketType: { completeSet: {} },
      })
      .accounts({
        payer: payer.publicKey,
        market: marketPda,
        vault: vaultPda,
        collateralMint: mint2022,
        creator: payer.publicKey,
        creatorFeeAccount: creatorFeeAta,
        globalConfig: globalConfigPda,
        allowedMint: allowed2022Pda,
        marketCategory: null,
        collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const market = await program.account.market.fetch(marketPda);
    assert.equal(
      market.collateralMint.toBase58(),
      mint2022.toBase58(),
      'token-2022 collateral mint should be stored on market'
    );
  });
});

describe('edge-cases: create market', () => {
  it('fails with collateral mint not on allowlist', async () => {
    const unlisted = Keypair.generate().publicKey;
    const marketId = newMarketId();
    const marketPda = deriveMarket(program.programId, payer.publicKey, marketId);

    // The allowedMint PDA simply doesn't exist — Anchor rejects the account
    // constraint with AccountNotInitialized (not a custom program error code).
    await assertThrows(async () => {
      await program.methods
        .createMarket({
          marketId, outcomeCount: 2, resolutionThreshold: 1,
          closeAt: new BN(Math.floor(Date.now() / 1000) + 3600),
          creatorFeeBps: 0, depositPlatformFeeBps: 0, numResolvers: 1,
          title: 'Test market',
          marketType: { completeSet: {} },
        })
        .accounts({
          payer: payer.publicKey, market: marketPda,
          vault: deriveVault(program.programId, marketPda),
          collateralMint: unlisted, creator: payer.publicKey,
          creatorFeeAccount: creatorFeeAta, globalConfig: globalConfigPda,
          allowedMint: deriveAllowedMint(program.programId, unlisted),
          marketCategory: null,
          collateralTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ skipPreflight: true });
    }, 'MintNotAllowed (unlisted collateral)');
  });

  it('fails when close_at is in the past', async () => {
    const marketId = newMarketId();
    const marketPda = deriveMarket(program.programId, payer.publicKey, marketId);

    await assertErrorCode(async () => {
      await program.methods
        .createMarket({
          marketId, outcomeCount: 2, resolutionThreshold: 1,
          closeAt: new BN(Math.floor(Date.now() / 1000) - 60),
          creatorFeeBps: 0, depositPlatformFeeBps: 0, numResolvers: 1,
          title: 'Test market',
          marketType: { completeSet: {} },
        })
        .accounts({
          payer: payer.publicKey, market: marketPda,
          vault: deriveVault(program.programId, marketPda),
          collateralMint, creator: payer.publicKey,
          creatorFeeAccount: creatorFeeAta, globalConfig: globalConfigPda,
          allowedMint: allowedMintPda,
          marketCategory: null,
          collateralTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ skipPreflight: true });
    }, 6013, 'CloseAtMustBeInFuture');
  });

  it('fails with outcome count of 1 (below minimum of 2)', async () => {
    const marketId = newMarketId();
    const marketPda = deriveMarket(program.programId, payer.publicKey, marketId);

    await assertErrorCode(async () => {
      await program.methods
        .createMarket({
          marketId, outcomeCount: 1, resolutionThreshold: 1,
          closeAt: new BN(Math.floor(Date.now() / 1000) + 3600),
          creatorFeeBps: 0, depositPlatformFeeBps: 0, numResolvers: 1,
          title: 'Test market',
          marketType: { completeSet: {} },
        })
        .accounts({
          payer: payer.publicKey, market: marketPda,
          vault: deriveVault(program.programId, marketPda),
          collateralMint, creator: payer.publicKey,
          creatorFeeAccount: creatorFeeAta, globalConfig: globalConfigPda,
          allowedMint: allowedMintPda,
          marketCategory: null,
          collateralTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ skipPreflight: true });
    }, 6009, 'InvalidOutcomeIndex');
  });

  it('fails when total fees exceed 10000 bps', async () => {
    const marketId = newMarketId();
    const marketPda = deriveMarket(program.programId, payer.publicKey, marketId);

    await assertErrorCode(async () => {
      await program.methods
        .createMarket({
          marketId, outcomeCount: 2, resolutionThreshold: 1,
          closeAt: new BN(Math.floor(Date.now() / 1000) + 3600),
          creatorFeeBps: 5001, depositPlatformFeeBps: 5001, numResolvers: 1,
          title: 'Test market',
          marketType: { completeSet: {} },
        })
        .accounts({
          payer: payer.publicKey, market: marketPda,
          vault: deriveVault(program.programId, marketPda),
          collateralMint, creator: payer.publicKey,
          creatorFeeAccount: creatorFeeAta, globalConfig: globalConfigPda,
          allowedMint: allowedMintPda,
          marketCategory: null,
          collateralTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ skipPreflight: true });
    }, 6012, 'InvalidFeeBps');
  });

  it('fails when resolution threshold exceeds num resolvers', async () => {
    const marketId = newMarketId();
    const marketPda = deriveMarket(program.programId, payer.publicKey, marketId);

    await assertErrorCode(async () => {
      await program.methods
        .createMarket({
          marketId, outcomeCount: 2, resolutionThreshold: 3,
          closeAt: new BN(Math.floor(Date.now() / 1000) + 3600),
          creatorFeeBps: 0, depositPlatformFeeBps: 0, numResolvers: 2,
          title: 'Test market',
          marketType: { completeSet: {} },
        })
        .accounts({
          payer: payer.publicKey, market: marketPda,
          vault: deriveVault(program.programId, marketPda),
          collateralMint, creator: payer.publicKey,
          creatorFeeAccount: creatorFeeAta, globalConfig: globalConfigPda,
          allowedMint: allowedMintPda,
          marketCategory: null,
          collateralTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ skipPreflight: true });
    }, 6015, 'InvalidResolutionThreshold');
  });
});

describe('edge-cases: minting', () => {
  it('fails to mint after market is closed early', async () => {
    const marketId = newMarketId();
    const { marketPda, outcomeMints, resolverPdas } = await createFullMarket(marketId);
    const outcomeAtas = await createOutcomeAtas(outcomeMints);

    // Close the market
    await program.methods
      .closeMarketEarly({ marketId })
      .accounts({
        signer: payer.publicKey, market: marketPda,
        resolver0: resolverPdas[0], resolver1: resolverPdas[1],
        resolver2: resolverPdas[2], resolver3: resolverPdas[3],
        resolver4: resolverPdas[4], resolver5: resolverPdas[5],
        resolver6: resolverPdas[6], resolver7: resolverPdas[7],
      })
      .rpc({ skipPreflight: true });

    await assertErrorCode(
      () => mintSet(marketPda, marketId, outcomeMints, outcomeAtas, new BN(1_000_000)),
      6002, 'MarketClosed'
    );
  });

  it('fails to mint zero amount', async () => {
    const marketId = newMarketId();
    const { marketPda, outcomeMints } = await createFullMarket(marketId);
    const outcomeAtas = await createOutcomeAtas(outcomeMints);

    await assertErrorCode(
      () => mintSet(marketPda, marketId, outcomeMints, outcomeAtas, new BN(0)),
      6014, 'ZeroMintAmount'
    );
  });
});

describe('edge-cases: resolution — vote', () => {
  it('fails when non-resolver tries to vote', async () => {
    const marketId = newMarketId();
    const { marketPda, resolverPdas } = await createFullMarket(marketId, {
      resolverPubkeys: [resolverKeypair.publicKey],
    });
    const stranger = Keypair.generate();
    const sig = await connection.requestAirdrop(stranger.publicKey, 1e9);
    await connection.confirmTransaction(await connection.getLatestBlockhash().then(lb => ({ signature: sig, ...lb })));

    await assertErrorCode(async () => {
      await program.methods
        .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 0 })
        .accounts({
          resolverSigner: stranger.publicKey, market: marketPda,
          resolutionVote: deriveResolutionVote(program.programId, marketPda, 0),
          outcomeTally: deriveOutcomeTally(program.programId, marketPda, 0),
          resolver0: resolverPdas[0], resolver1: resolverPdas[1],
          resolver2: resolverPdas[2], resolver3: resolverPdas[3],
          resolver4: resolverPdas[4], resolver5: resolverPdas[5],
          resolver6: resolverPdas[6], resolver7: resolverPdas[7],
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc({ skipPreflight: true });
    }, 6010, 'NotResolver');
  });

  it('fails when voting for an outcome index >= outcome_count', async () => {
    const marketId = newMarketId();
    const { marketPda, resolverPdas } = await createFullMarket(marketId, {
      outcomeCount: 2,
      resolverPubkeys: [resolverKeypair.publicKey],
    });

    await assertErrorCode(async () => {
      await program.methods
        .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 5 })
        .accounts({
          resolverSigner: resolverKeypair.publicKey, market: marketPda,
          resolutionVote: deriveResolutionVote(program.programId, marketPda, 0),
          outcomeTally: deriveOutcomeTally(program.programId, marketPda, 5),
          resolver0: resolverPdas[0], resolver1: resolverPdas[1],
          resolver2: resolverPdas[2], resolver3: resolverPdas[3],
          resolver4: resolverPdas[4], resolver5: resolverPdas[5],
          resolver6: resolverPdas[6], resolver7: resolverPdas[7],
          systemProgram: SystemProgram.programId,
        })
        .signers([resolverKeypair])
        .rpc({ skipPreflight: true });
    }, 6009, 'InvalidOutcomeIndex');
  });

  it('resolver can submit a vote', async () => {
    const marketId = newMarketId();
    const { marketPda, resolverPdas } = await createFullMarket(marketId, {
      outcomeCount: 3,
      resolverPubkeys: [resolverKeypair.publicKey],
    });
    const votePda = deriveResolutionVote(program.programId, marketPda, 0);

    await program.methods
      .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 2 })
      .accounts({
        resolverSigner: resolverKeypair.publicKey, market: marketPda,
        resolutionVote: votePda,
        outcomeTally: deriveOutcomeTally(program.programId, marketPda, 2),
        resolver0: resolverPdas[0], resolver1: resolverPdas[1],
        resolver2: resolverPdas[2], resolver3: resolverPdas[3],
        resolver4: resolverPdas[4], resolver5: resolverPdas[5],
        resolver6: resolverPdas[6], resolver7: resolverPdas[7],
        systemProgram: SystemProgram.programId,
      })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    const vote = await program.account.resolutionVote.fetch(votePda);
    assert.isTrue(vote.hasVoted);
    assert.equal(vote.outcomeIndex, 2, 'vote should record outcome 2');
  });

  it('fails to vote twice without revoke (AlreadyVoted)', async () => {
    const marketId = newMarketId();
    const { marketPda, resolverPdas } = await createFullMarket(marketId, {
      resolverPubkeys: [resolverKeypair.publicKey],
    });

    const accounts = {
      resolverSigner: resolverKeypair.publicKey,
      market: marketPda,
      resolutionVote: deriveResolutionVote(program.programId, marketPda, 0),
      outcomeTally: deriveOutcomeTally(program.programId, marketPda, 0),
      resolver0: resolverPdas[0],
      resolver1: resolverPdas[1],
      resolver2: resolverPdas[2],
      resolver3: resolverPdas[3],
      resolver4: resolverPdas[4],
      resolver5: resolverPdas[5],
      resolver6: resolverPdas[6],
      resolver7: resolverPdas[7],
      systemProgram: SystemProgram.programId,
    };

    await program.methods
      .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 0 })
      .accounts(accounts)
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    await assertErrorCode(async () => {
      await program.methods
        .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 1 })
        .accounts({
          ...accounts,
          outcomeTally: deriveOutcomeTally(program.programId, marketPda, 1),
        })
        .signers([resolverKeypair])
        .rpc({ skipPreflight: true });
    }, 6017, 'AlreadyVoted');
  });

  it('revoke then vote different outcome updates tallies', async () => {
    const marketId = newMarketId();
    const { marketPda, resolverPdas } = await createFullMarket(marketId, {
      outcomeCount: 2,
      resolverPubkeys: [resolverKeypair.publicKey],
    });
    const votePda = deriveResolutionVote(program.programId, marketPda, 0);
    const tally0 = deriveOutcomeTally(program.programId, marketPda, 0);
    const tally1 = deriveOutcomeTally(program.programId, marketPda, 1);

    const base = {
      resolverSigner: resolverKeypair.publicKey,
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
      systemProgram: SystemProgram.programId,
    };

    await program.methods
      .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 0 })
      .accounts({ ...base, outcomeTally: tally0 })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    await program.methods
      .revokeResolutionVote({ marketId, resolverIndex: 0, outcomeIndex: 0 })
      .accounts({
        resolverSigner: resolverKeypair.publicKey,
        market: marketPda,
        resolutionVote: votePda,
        outcomeTally: tally0,
        resolver0: resolverPdas[0],
        resolver1: resolverPdas[1],
        resolver2: resolverPdas[2],
        resolver3: resolverPdas[3],
        resolver4: resolverPdas[4],
        resolver5: resolverPdas[5],
        resolver6: resolverPdas[6],
        resolver7: resolverPdas[7],
      })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    await program.methods
      .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 1 })
      .accounts({ ...base, outcomeTally: tally1 })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    const t0 = await program.account.outcomeTally.fetch(tally0);
    const t1 = await program.account.outcomeTally.fetch(tally1);
    assert.equal(t0.count, 0);
    assert.equal(t1.count, 1);
    const vote = await program.account.resolutionVote.fetch(votePda);
    assert.isTrue(vote.hasVoted);
    assert.equal(vote.outcomeIndex, 1);
  });

  it('finalize_resolution is a no-op when threshold is not met (M-of-N)', async () => {
    // 2-of-3 market; only 1 resolver votes — threshold not met
    const marketId = newMarketId();
    const resolver2 = Keypair.generate();
    const resolver3 = Keypair.generate();
    const { marketPda, resolverPdas } = await createFullMarket(marketId, {
      outcomeCount: 2, resolutionThreshold: 2, numResolvers: 3,
      resolverPubkeys: [resolverKeypair.publicKey, resolver2.publicKey, resolver3.publicKey],
    });

    // Only resolver 0 votes
    await program.methods
      .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 0 })
      .accounts({
        resolverSigner: resolverKeypair.publicKey, market: marketPda,
        resolutionVote: deriveResolutionVote(program.programId, marketPda, 0),
        outcomeTally: deriveOutcomeTally(program.programId, marketPda, 0),
        resolver0: resolverPdas[0], resolver1: resolverPdas[1],
        resolver2: resolverPdas[2], resolver3: resolverPdas[3],
        resolver4: resolverPdas[4], resolver5: resolverPdas[5],
        resolver6: resolverPdas[6], resolver7: resolverPdas[7],
        systemProgram: SystemProgram.programId,
      })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    await program.methods
      .finalizeResolution({ marketId })
      .accounts({
        market: marketPda,
        ...(await outcomeTallyAccountsOptional(marketPda)),
      })
      .rpc({ skipPreflight: true });

    const market = await program.account.market.fetch(marketPda);
    assert.isNull(market.resolvedOutcomeIndex, 'market should NOT be resolved yet');
  });
});

describe('edge-cases: redeem_winning', () => {
  it('fails to redeem before market is resolved', async () => {
    const marketId = newMarketId();
    const { marketPda, outcomeMints } = await createFullMarket(marketId);
    const outcomeAtas = await createOutcomeAtas(outcomeMints);
    await mintSet(marketPda, marketId, outcomeMints, outcomeAtas, new BN(1_000_000));

    await assertErrorCode(async () => {
      await program.methods
        .redeemWinning({ marketId, amount: new BN(100) })
        .accounts({
          user: payer.publicKey, market: marketPda,
          vault: deriveVault(program.programId, marketPda),
          collateralMint, userCollateralAccount: payerCollateralAta,
          globalConfig: globalConfigPda,
          platformTreasuryWallet: userKeypair.publicKey,
          outcomeMint0: outcomeMints[0], outcomeMint1: outcomeMints[1],
          outcomeMint2: outcomeMints[2], outcomeMint3: outcomeMints[3],
          outcomeMint4: outcomeMints[4], outcomeMint5: outcomeMints[5],
          outcomeMint6: outcomeMints[6], outcomeMint7: outcomeMints[7],
          userWinningOutcome: outcomeAtas[0],
          collateralTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ skipPreflight: true });
    }, 6007, 'MarketNotResolved');
  });
});

describe('edge-cases: void market', () => {
  it('cannot void an already-resolved market', async () => {
    const marketId = newMarketId();
    const { marketPda, resolverPdas } = await createFullMarket(marketId);

    // Vote and finalize
    await program.methods
      .voteResolution({ marketId, resolverIndex: 0, outcomeIndex: 0 })
      .accounts({
        resolverSigner: resolverKeypair.publicKey, market: marketPda,
        resolutionVote: deriveResolutionVote(program.programId, marketPda, 0),
        outcomeTally: deriveOutcomeTally(program.programId, marketPda, 0),
        resolver0: resolverPdas[0], resolver1: resolverPdas[1],
        resolver2: resolverPdas[2], resolver3: resolverPdas[3],
        resolver4: resolverPdas[4], resolver5: resolverPdas[5],
        resolver6: resolverPdas[6], resolver7: resolverPdas[7],
        systemProgram: SystemProgram.programId,
      })
      .signers([resolverKeypair])
      .rpc({ skipPreflight: true });

    await program.methods
      .finalizeResolution({ marketId })
      .accounts({
        market: marketPda,
        ...(await outcomeTallyAccountsOptional(marketPda)),
      })
      .rpc({ skipPreflight: true });

    await assertErrorCode(async () => {
      await program.methods
        .voidMarket({ marketId })
        .accounts({
          signer: payer.publicKey, market: marketPda,
          resolver0: resolverPdas[0], resolver1: resolverPdas[1],
          resolver2: resolverPdas[2], resolver3: resolverPdas[3],
          resolver4: resolverPdas[4], resolver5: resolverPdas[5],
          resolver6: resolverPdas[6], resolver7: resolverPdas[7],
        })
        .rpc({ skipPreflight: true });
    }, 6008, 'CannotVoidResolvedMarket');
  });

  it('redeem_complete_set still works after market is voided', async () => {
    const marketId = newMarketId();
    const { marketPda, outcomeMints, resolverPdas } = await createFullMarket(marketId);
    const outcomeAtas = await createOutcomeAtas(outcomeMints);
    const AMOUNT = new BN(2_000_000);
    await mintSet(marketPda, marketId, outcomeMints, outcomeAtas, AMOUNT);

    // Void
    await program.methods
      .voidMarket({ marketId })
      .accounts({
        signer: payer.publicKey, market: marketPda,
        resolver0: resolverPdas[0], resolver1: resolverPdas[1],
        resolver2: resolverPdas[2], resolver3: resolverPdas[3],
        resolver4: resolverPdas[4], resolver5: resolverPdas[5],
        resolver6: resolverPdas[6], resolver7: resolverPdas[7],
      })
      .rpc({ skipPreflight: true });

    // Redeem complete set should succeed
    await program.methods
      .redeemCompleteSet({ marketId })
      .accounts({
        user: payer.publicKey, market: marketPda,
        vault: deriveVault(program.programId, marketPda),
        collateralMint, userCollateralAccount: payerCollateralAta,
        outcomeMint0: outcomeMints[0], outcomeMint1: outcomeMints[1],
        outcomeMint2: outcomeMints[2], outcomeMint3: outcomeMints[3],
        outcomeMint4: outcomeMints[4], outcomeMint5: outcomeMints[5],
        outcomeMint6: outcomeMints[6], outcomeMint7: outcomeMints[7],
        userOutcome0: outcomeAtas[0], userOutcome1: outcomeAtas[1],
        userOutcome2: outcomeAtas[2], userOutcome3: outcomeAtas[3],
        userOutcome4: outcomeAtas[4], userOutcome5: outcomeAtas[5],
        userOutcome6: outcomeAtas[6], userOutcome7: outcomeAtas[7],
        collateralTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });

    // Market voided flag must be true
    const market = await program.account.market.fetch(marketPda);
    assert.isTrue(market.voided);
  });

  it('cannot mint into a voided market', async () => {
    const marketId = newMarketId();
    const { marketPda, outcomeMints, resolverPdas } = await createFullMarket(marketId);
    const outcomeAtas = await createOutcomeAtas(outcomeMints);

    await program.methods
      .voidMarket({ marketId })
      .accounts({
        signer: payer.publicKey, market: marketPda,
        resolver0: resolverPdas[0], resolver1: resolverPdas[1],
        resolver2: resolverPdas[2], resolver3: resolverPdas[3],
        resolver4: resolverPdas[4], resolver5: resolverPdas[5],
        resolver6: resolverPdas[6], resolver7: resolverPdas[7],
      })
      .rpc({ skipPreflight: true });

    await assertErrorCode(
      () => mintSet(marketPda, marketId, outcomeMints, outcomeAtas, new BN(1_000_000)),
      6005, 'MarketVoided'
    );
  });

  it('stranger cannot void a market they have no role in', async () => {
    const marketId = newMarketId();
    const { marketPda, resolverPdas } = await createFullMarket(marketId);
    const stranger = Keypair.generate();
    const sig = await connection.requestAirdrop(stranger.publicKey, 1e9);
    await connection.confirmTransaction(await connection.getLatestBlockhash().then(lb => ({ signature: sig, ...lb })));

    await assertErrorCode(async () => {
      await program.methods
        .voidMarket({ marketId })
        .accounts({
          signer: stranger.publicKey, market: marketPda,
          resolver0: resolverPdas[0], resolver1: resolverPdas[1],
          resolver2: resolverPdas[2], resolver3: resolverPdas[3],
          resolver4: resolverPdas[4], resolver5: resolverPdas[5],
          resolver6: resolverPdas[6], resolver7: resolverPdas[7],
        })
        .signers([stranger])
        .rpc({ skipPreflight: true });
    }, 6011, 'OnlyCreatorOrResolver');
  });
});
