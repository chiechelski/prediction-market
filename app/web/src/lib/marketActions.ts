import { AnchorProvider, Program } from '@coral-xyz/anchor';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import BN from 'bn.js';
import { fetchIdl } from '@/lib/program';
import {
  deriveAllowedMint,
  deriveMarket,
  deriveMarketCategory,
  deriveVault,
  deriveGlobalConfig,
  deriveAllOutcomeMints,
  deriveAllOutcomeTallies,
  deriveAllResolvers,
  deriveResolver,
  deriveOutcomeTally,
  deriveResolutionVote,
  deriveUserProfile,
  deriveParimutuelState,
  deriveParimutuelPosition,
} from '@/lib/pda';
import { assertSolBalanceForPayer } from '@/lib/solBalance';
import {
  ataAddress,
  ensureAssociatedTokenAccount,
  getMintTokenProgram,
  instructionsToCreateCollateralAtaIfMissing,
  isToken2022Program,
  maybeRentTopUpInstruction,
  rentTopUpLamportsNeeded,
  TOKEN_2022_RENT_HEADROOM_LAMPORTS,
} from '@/lib/token';

export const DEFAULT_PUBKEY = new PublicKey(
  '11111111111111111111111111111111'
);

/** Skip simulateTransaction preflight when sending pari txs (see RPC rent false positives). Set false to restore simulation. */
const PARIMUTUEL_SEND_OPTS = {
  commitment: 'confirmed' as const,
  skipPreflight: true,
};

/**
 * Given a treasury wallet address and a collateral mint, returns:
 *   - the ATA address that would receive token fees
 *   - whether that ATA already exists on-chain
 *
 * The treasury ATA must exist before minting; the UI creates it when you trade
 * if it is missing. This helper is for display / diagnostics.
 */
export async function getTreasuryAtaInfo(
  connection: Connection,
  treasuryWallet: PublicKey,
  collateralMint: PublicKey
): Promise<{ ata: PublicKey; exists: boolean }> {
  const tokenProgram = await getMintTokenProgram(connection, collateralMint);
  const ata = ataAddress(collateralMint, treasuryWallet, tokenProgram);
  const info = await connection.getAccountInfo(ata);
  return { ata, exists: info !== null };
}

export async function getProgram(
  connection: Connection,
  wallet: WalletContextState
): Promise<Program> {
  const idl = await fetchIdl();
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  return new Program(idl, provider);
}

/**
 * Create a `MarketCategory` PDA. `categoryId` must equal `global_config.next_category_id`.
 */
export async function createMarketCategoryTx(
  connection: Connection,
  wallet: WalletContextState,
  categoryId: BN,
  name: string
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey) throw new Error('Wallet required');
  const globalConfig = deriveGlobalConfig(program.programId);
  const marketCategory = deriveMarketCategory(program.programId, categoryId);
  await program.methods
    .createMarketCategory(categoryId, name)
    .accounts({
      globalConfig,
      marketCategory,
      authority: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function updateMarketCategoryTx(
  connection: Connection,
  wallet: WalletContextState,
  categoryId: BN,
  name: string,
  active: boolean
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey) throw new Error('Wallet required');
  const globalConfig = deriveGlobalConfig(program.programId);
  const marketCategory = deriveMarketCategory(program.programId, categoryId);
  await program.methods
    .updateMarketCategory(name, active)
    .accounts({
      globalConfig,
      marketCategory,
      authority: wallet.publicKey,
    })
    .rpc();
}

export async function createMarketFullFlow(
  connection: Connection,
  wallet: WalletContextState,
  params: {
    marketId: BN;
    outcomeCount: number;
    resolutionThreshold: number;
    closeAt: BN;
    creatorFeeBps: number;
    depositPlatformFeeBps: number;
    collateralMint: PublicKey;
    /** First resolver is usually the connected wallet; length must equal numResolvers */
    resolverPubkeys: PublicKey[];
    title: string;
    /** Omit or `null` for uncategorized (`Pubkey::default()` on-chain). */
    marketCategory: PublicKey | null;
    /** Default complete-set (SPL outcomes). Pari-mutuel skips outcome mint init. */
    marketType?: 'completeSet' | 'parimutuel';
  }
): Promise<{ marketPda: PublicKey; vault: PublicKey }> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet required (with signTransaction for market creation)');
  }

  await assertSolBalanceForPayer(connection, wallet.publicKey);

  const numResolvers = params.resolverPubkeys.length;
  if (numResolvers < 1 || numResolvers > 8) {
    throw new Error('Need 1–8 resolvers');
  }
  if (
    params.resolutionThreshold < 1 ||
    params.resolutionThreshold > numResolvers
  ) {
    throw new Error('Invalid resolution threshold');
  }

  const creator = wallet.publicKey;
  const marketPda = deriveMarket(program.programId, creator, params.marketId);
  const vaultPda = deriveVault(program.programId, marketPda);
  const globalConfig = deriveGlobalConfig(program.programId);
  const allowedMint = deriveAllowedMint(program.programId, params.collateralMint);
  const collateralTokenProgram = await getMintTokenProgram(
    connection,
    params.collateralMint
  );

  const gcAccount = await (program.account as any).globalConfig.fetch(globalConfig);
  const platformTreasuryWallet = gcAccount.platformTreasury as PublicKey;

  const { ata: creatorFeeAta, instructions: creatorFeeSetupIxs } =
    await instructionsToCreateCollateralAtaIfMissing(
      connection,
      creator,
      params.collateralMint,
      creator,
      collateralTokenProgram
    );

  const { instructions: treasurySetupIxs } =
    await instructionsToCreateCollateralAtaIfMissing(
      connection,
      creator,
      params.collateralMint,
      platformTreasuryWallet,
      collateralTokenProgram
    );

  const marketTypeArg =
    params.marketType === 'parimutuel'
      ? { parimutuel: {} }
      : { completeSet: {} };

  const createMarketIx = await program.methods
    .createMarket({
      marketId: params.marketId,
      outcomeCount: params.outcomeCount,
      resolutionThreshold: params.resolutionThreshold,
      closeAt: params.closeAt,
      creatorFeeBps: params.creatorFeeBps,
      depositPlatformFeeBps: params.depositPlatformFeeBps,
      numResolvers,
      title: params.title,
      marketType: marketTypeArg,
    })
    .accounts({
      payer: creator,
      market: marketPda,
      vault: vaultPda,
      collateralMint: params.collateralMint,
      creator,
      creatorFeeAccount: creatorFeeAta,
      globalConfig,
      allowedMint,
      ...(params.marketCategory != null
        ? { marketCategory: params.marketCategory }
        : {}),
      collateralTokenProgram,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const createMarketTx = new Transaction();
  for (const ix of creatorFeeSetupIxs) createMarketTx.add(ix);
  for (const ix of treasurySetupIxs) createMarketTx.add(ix);
  createMarketTx.add(createMarketIx);

  const provider = program.provider as AnchorProvider;
  await provider.sendAndConfirm(createMarketTx, [], {
    commitment: 'confirmed',
    skipPreflight: false,
  });

  const resolverTx = new Transaction();

  let gcForParimutuel: any = null;
  if (params.marketType === 'parimutuel') {
    gcForParimutuel = await (program.account as any).globalConfig.fetch(
      globalConfig
    );
    const platformTreasuryWallet = gcForParimutuel.platformTreasury as PublicKey;
    const { instructions: treasuryAtaForPari } =
      await instructionsToCreateCollateralAtaIfMissing(
        connection,
        creator,
        params.collateralMint,
        platformTreasuryWallet,
        collateralTokenProgram
      );
    for (const ix of treasuryAtaForPari) resolverTx.add(ix);
  }

  for (let i = 0; i < numResolvers; i++) {
    const pk = params.resolverPubkeys[i];
    if (!pk) throw new Error(`Resolver pubkey missing for slot ${i}`);
    const ix = await program.methods
      .initializeMarketResolver({
        marketId: params.marketId,
        resolverIndex: i,
        resolverPubkey: pk,
      })
      .accounts({
        payer: creator,
        market: marketPda,
        resolver: deriveResolver(program.programId, marketPda, i),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    resolverTx.add(ix);
  }

  // Pari-mutuel pool init does not depend on resolvers; same tx saves a wallet approval.
  if (params.marketType === 'parimutuel' && gcForParimutuel) {
    const protocolBps = gcForParimutuel.parimutuelPenaltyProtocolShareBps as number;
    const parimutuelState = deriveParimutuelState(program.programId, marketPda);
    const pariIx = await program.methods
      .initializeParimutuelState({
        marketId: params.marketId,
        earlyWithdrawPenaltyBps: 500,
        penaltyKeptInPoolBps: 8000,
        penaltySurplusCreatorShareBps: 10000 - protocolBps,
      })
      .accounts({
        payer: creator,
        market: marketPda,
        globalConfig,
        parimutuelState,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    resolverTx.add(pariIx);
  }

  if (!wallet.sendTransaction) throw new Error('Wallet cannot send transactions');
  const resolverSig = await wallet.sendTransaction(resolverTx, connection, {
    skipPreflight: false,
  });
  await connection.confirmTransaction(resolverSig, 'confirmed');

  if (params.marketType !== 'parimutuel') {
    const outcomeMints = deriveAllOutcomeMints(program.programId, marketPda);

    await program.methods
      .initializeMarketMints({ marketId: params.marketId })
      .accounts({
        payer: creator,
        market: marketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        outcomeMint0: outcomeMints[0], outcomeMint1: outcomeMints[1],
        outcomeMint2: outcomeMints[2], outcomeMint3: outcomeMints[3],
        outcomeMint4: outcomeMints[4], outcomeMint5: outcomeMints[5],
        outcomeMint6: outcomeMints[6], outcomeMint7: outcomeMints[7],
      })
      .rpc();
  }

  return { marketPda, vault: vaultPda };
}

/** Outcome mints use SPL Token; ATAs use TOKEN_PROGRAM_ID. */
export async function ensureOutcomeAtas(
  connection: Connection,
  wallet: WalletContextState,
  outcomeMints: PublicKey[] // length 8
): Promise<PublicKey[]> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }
  const owner = wallet.publicKey;
  const atas = outcomeMints.map((m) =>
    getAssociatedTokenAddressSync(
      m,
      owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  const infos = await Promise.all(
    atas.map((a) => connection.getAccountInfo(a))
  );
  const ixs = infos
    .map((info, i) =>
      info
        ? null
        : createAssociatedTokenAccountInstruction(
            wallet.publicKey!,
            atas[i]!,
            owner,
            outcomeMints[i]!,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
    )
    .filter(Boolean) as ReturnType<
    typeof createAssociatedTokenAccountInstruction
  >[];

  if (ixs.length) {
    const { Transaction } = await import('@solana/web3.js');
    const tx = new Transaction().add(...ixs);
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    const signed = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction({
      signature: sig,
      blockhash,
      lastValidBlockHeight,
    });
  }
  return atas;
}

export async function mintCompleteSetTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN,
  collateralMint: PublicKey,
  amount: BN
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey) throw new Error('Wallet required');

  const collateralTokenProgram = await getMintTokenProgram(
    connection,
    collateralMint
  );
  const userCollateral = ataAddress(
    collateralMint,
    wallet.publicKey,
    collateralTokenProgram
  );

  await ensureAssociatedTokenAccount(
    connection,
    wallet,
    collateralMint,
    wallet.publicKey,
    collateralTokenProgram
  );

  const globalConfigPda = deriveGlobalConfig(program.programId);
  const globalConfig = await (program.account as any).globalConfig.fetch(globalConfigPda);
  const platformTreasuryWallet = globalConfig.platformTreasury as PublicKey;

  const platformTreasuryAta = ataAddress(collateralMint, platformTreasuryWallet, collateralTokenProgram);
  await ensureAssociatedTokenAccount(
    connection,
    wallet,
    collateralMint,
    platformTreasuryWallet,
    collateralTokenProgram
  );

  const market = await (program.account as any).market.fetch(marketPda);
  const creatorFeeAccount = market.creatorFeeAccount as PublicKey;
  const n = BN.isBN(market.outcomeCount)
    ? (market.outcomeCount as InstanceType<typeof BN>).toNumber()
    : Number(market.outcomeCount);
  const allowedMint = deriveAllowedMint(program.programId, collateralMint);
  const vault = deriveVault(program.programId, marketPda);
  const outcomeMints = deriveAllOutcomeMints(program.programId, marketPda).slice(0, n);
  const outcomeAtas = await ensureOutcomeAtas(
    connection,
    wallet,
    outcomeMints
  );

  const remainingAccounts = outcomeMints.flatMap((mint: PublicKey, i: number) => [
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: outcomeAtas[i], isSigner: false, isWritable: true },
  ]);

  await program.methods
    .mintCompleteSet({ amount, marketId })
    .accounts({
      user: wallet.publicKey,
      market: marketPda,
      vault,
      collateralMint,
      userCollateralAccount: userCollateral,
      creatorFeeAccount,
      globalConfig: globalConfigPda,
      allowedMint,
      platformTreasuryWallet,
      platformTreasuryAta,
      collateralTokenProgram,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .rpc();
}

export async function redeemCompleteSetTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN,
  collateralMint: PublicKey
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey) throw new Error('Wallet required');

  const collateralTokenProgram = await getMintTokenProgram(
    connection,
    collateralMint
  );
  const userCollateral = ataAddress(
    collateralMint,
    wallet.publicKey,
    collateralTokenProgram
  );

  const vault = deriveVault(program.programId, marketPda);
  const outcomeMints = deriveAllOutcomeMints(program.programId, marketPda);
  const outcomeAtas = await ensureOutcomeAtas(
    connection,
    wallet,
    outcomeMints
  );

  await program.methods
    .redeemCompleteSet({ marketId })
    .accounts({
      user: wallet.publicKey,
      market: marketPda,
      vault,
      collateralMint,
      userCollateralAccount: userCollateral,
      outcomeMint0: outcomeMints[0], outcomeMint1: outcomeMints[1],
      outcomeMint2: outcomeMints[2], outcomeMint3: outcomeMints[3],
      outcomeMint4: outcomeMints[4], outcomeMint5: outcomeMints[5],
      outcomeMint6: outcomeMints[6], outcomeMint7: outcomeMints[7],
      userOutcome0: outcomeAtas[0], userOutcome1: outcomeAtas[1],
      userOutcome2: outcomeAtas[2], userOutcome3: outcomeAtas[3],
      userOutcome4: outcomeAtas[4], userOutcome5: outcomeAtas[5],
      userOutcome6: outcomeAtas[6], userOutcome7: outcomeAtas[7],
      collateralTokenProgram,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

export async function voteResolutionTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN,
  outcomeIndex: number,
  resolverIndex: number
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey) throw new Error('Wallet required');

  const resolutionVote = deriveResolutionVote(
    program.programId,
    marketPda,
    resolverIndex
  );
  const outcomeTally = deriveOutcomeTally(
    program.programId,
    marketPda,
    outcomeIndex
  );
  const resolverPda = deriveResolver(program.programId, marketPda, resolverIndex);

  await program.methods
    .voteResolution({
      marketId,
      outcomeIndex,
      resolverIndex,
    })
    .accounts({
      resolverSigner: wallet.publicKey,
      market: marketPda,
      resolver: resolverPda,
      resolutionVote,
      outcomeTally,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function revokeResolutionVoteTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN,
  outcomeIndex: number,
  resolverIndex: number
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey) throw new Error('Wallet required');

  const resolutionVote = deriveResolutionVote(
    program.programId,
    marketPda,
    resolverIndex
  );
  const outcomeTally = deriveOutcomeTally(
    program.programId,
    marketPda,
    outcomeIndex
  );
  const resolverPda = deriveResolver(program.programId, marketPda, resolverIndex);

  await program.methods
    .revokeResolutionVote({
      marketId,
      resolverIndex,
      outcomeIndex,
    })
    .accounts({
      resolverSigner: wallet.publicKey,
      market: marketPda,
      resolver: resolverPda,
      resolutionVote,
      outcomeTally,
    })
    .rpc();
}

/** Read `ResolutionVote` PDA for a resolver slot (no wallet). */
export async function fetchResolutionVoteState(
  connection: Connection,
  marketPda: PublicKey,
  resolverIndex: number
): Promise<{ hasVoted: boolean; outcomeIndex: number }> {
  const idl = await fetchIdl();
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: DEFAULT_PUBKEY,
      signTransaction: async (t: unknown) => t,
      signAllTransactions: async (ts: unknown) => ts,
    } as any,
    { commitment: 'confirmed' }
  );
  const program = new Program(idl, provider);
  const votePda = deriveResolutionVote(
    program.programId,
    marketPda,
    resolverIndex
  );
  try {
    const acc = await (program.account as any).resolutionVote.fetch(votePda);
    return {
      hasVoted: Boolean(acc.hasVoted),
      outcomeIndex: Number(acc.outcomeIndex ?? 0),
    };
  } catch {
    return { hasVoted: false, outcomeIndex: 0 };
  }
}

/** Per-outcome resolver vote counts (slots 0–7). Missing PDAs read as 0. */
export async function fetchOutcomeTallyCounts(
  connection: Connection,
  marketPda: PublicKey
): Promise<number[]> {
  const idl = await fetchIdl();
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: DEFAULT_PUBKEY,
      signTransaction: async (t: unknown) => t,
      signAllTransactions: async (ts: unknown) => ts,
    } as any,
    { commitment: 'confirmed' }
  );
  const program = new Program(idl, provider);
  const pdas = deriveAllOutcomeTallies(program.programId, marketPda);
  return Promise.all(
    pdas.map(async (pda) => {
      try {
        const acc = await (program.account as any).outcomeTally.fetch(pda);
        return Number(acc.count ?? 0);
      } catch {
        return 0;
      }
    })
  );
}

export async function finalizeResolutionTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN
): Promise<void> {
  const program = await getProgram(connection, wallet);

  const tallies = deriveAllOutcomeTallies(program.programId, marketPda);
  const infos = await Promise.all(
    tallies.map((t) => connection.getAccountInfo(t))
  );

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
    } as any)
    .rpc();
}

export async function closeMarketEarlyTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey) throw new Error('Wallet required');

  const globalConfigPda = deriveGlobalConfig(program.programId);

  await program.methods
    .closeMarketEarly({ marketId })
    .accounts({
      signer: wallet.publicKey,
      globalConfig: globalConfigPda,
      market: marketPda,
    })
    .rpc();
}

export async function voidMarketTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey) throw new Error('Wallet required');

  const globalConfigPda = deriveGlobalConfig(program.programId);

  await program.methods
    .voidMarket({ marketId })
    .accounts({
      signer: wallet.publicKey,
      globalConfig: globalConfigPda,
      market: marketPda,
    })
    .rpc();
}

/** Which resolver slot (0–7) matches the connected wallet, if any. */
export async function findResolverSlot(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey
): Promise<number | null> {
  if (!wallet.publicKey) return null;
  const program = await getProgram(connection, wallet);
  const resolverPdas = deriveAllResolvers(program.programId, marketPda);
  for (let i = 0; i < 8; i++) {
    try {
      const r = await (program.account as any).resolver.fetch(resolverPdas[i]!);
      const pk = r.resolverPubkey as PublicKey;
      if (pk.equals(wallet.publicKey)) return i;
    } catch {
      /* missing account */
    }
  }
  return null;
}

export async function redeemWinningTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN,
  collateralMint: PublicKey,
  amount: BN
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey) throw new Error('Wallet required');

  const collateralTokenProgram = await getMintTokenProgram(
    connection,
    collateralMint
  );
  const userCollateral = ataAddress(
    collateralMint,
    wallet.publicKey,
    collateralTokenProgram
  );

  const globalConfigPda = deriveGlobalConfig(program.programId);
  const globalConfig = await (program.account as any).globalConfig.fetch(globalConfigPda);
  const platformTreasuryWallet = globalConfig.platformTreasury as PublicKey;

  const market = await (program.account as any).market.fetch(marketPda);
  const winningIdx = market.resolvedOutcomeIndex as number | null | undefined;
  if (winningIdx === null || winningIdx === undefined) {
    throw new Error('Market not resolved');
  }

  const vault = deriveVault(program.programId, marketPda);
  const outcomeMints = deriveAllOutcomeMints(program.programId, marketPda);
  const outcomeAtas = await ensureOutcomeAtas(
    connection,
    wallet,
    outcomeMints
  );

  await program.methods
    .redeemWinning({ marketId, amount })
    .accounts({
      user: wallet.publicKey,
      market: marketPda,
      vault,
      collateralMint,
      userCollateralAccount: userCollateral,
      outcomeMint0: outcomeMints[0], outcomeMint1: outcomeMints[1],
      outcomeMint2: outcomeMints[2], outcomeMint3: outcomeMints[3],
      outcomeMint4: outcomeMints[4], outcomeMint5: outcomeMints[5],
      outcomeMint6: outcomeMints[6], outcomeMint7: outcomeMints[7],
      userWinningOutcome: outcomeAtas[winningIdx]!,
      globalConfig: globalConfigPda,
      platformTreasuryWallet,
      collateralTokenProgram,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

// ─── User profile helpers ────────────────────────────────────────────────────

export interface UserProfileData {
  displayName: string;
  url: string;
  verified: boolean;
}

const READ_ONLY_WALLET = {
  publicKey: DEFAULT_PUBKEY,
  signTransaction: async (t: unknown) => t,
  signAllTransactions: async (ts: unknown) => ts,
};

/**
 * Fetch UserProfile via RPC only (no connected wallet required).
 */
export async function fetchUserProfileReadOnly(
  connection: Connection,
  targetWallet: PublicKey
): Promise<UserProfileData | null> {
  const idl = await fetchIdl();
  const provider = new AnchorProvider(connection, READ_ONLY_WALLET as any, {
    commitment: 'confirmed',
  });
  const program = new Program(idl, provider);
  const profilePda = deriveUserProfile(program.programId, targetWallet);
  try {
    const account = await (program.account as any).userProfile.fetch(profilePda);
    return {
      displayName: account.displayName as string,
      url: account.url as string,
      verified: account.verified as boolean,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch an on-chain UserProfile for any wallet.
 * Returns null when the account does not exist (profile not yet created).
 */
export async function fetchUserProfile(
  connection: Connection,
  _wallet: WalletContextState,
  targetWallet: PublicKey
): Promise<UserProfileData | null> {
  return fetchUserProfileReadOnly(connection, targetWallet);
}

/** Whether fetched market account is pari-mutuel (ledger pool). */
export function isParimutuelMarket(market: { marketType?: unknown }): boolean {
  const t = market.marketType as { parimutuel?: unknown } | undefined;
  return t != null && typeof t === 'object' && 'parimutuel' in t;
}

/** Must match on-chain `ParimutuelPosition::LEN` (discriminator + `InitSpace`). */
const PARIMUTUEL_POSITION_ACCOUNT_LEN = 163;

export async function parimutuelStakeTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN,
  collateralMint: PublicKey,
  outcomeIndex: number,
  amount: BN
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet required');
  }
  const collateralTokenProgram = await getMintTokenProgram(
    connection,
    collateralMint
  );
  const userCollateral = ataAddress(
    collateralMint,
    wallet.publicKey,
    collateralTokenProgram
  );
  await ensureAssociatedTokenAccount(
    connection,
    wallet,
    collateralMint,
    wallet.publicKey,
    collateralTokenProgram
  );
  const parimutuelState = deriveParimutuelState(program.programId, marketPda);
  const position = deriveParimutuelPosition(
    program.programId,
    marketPda,
    wallet.publicKey,
    outcomeIndex
  );
  const vaultPda = deriveVault(program.programId, marketPda);
  const allowedMint = deriveAllowedMint(program.programId, collateralMint);
  const globalConfigPda = deriveGlobalConfig(program.programId);
  const globalConfig = await (program.account as any).globalConfig.fetch(
    globalConfigPda
  );
  const treasuryWallet = globalConfig.platformTreasury as PublicKey;
  const platformTreasuryAta = ataAddress(
    collateralMint,
    treasuryWallet,
    collateralTokenProgram
  );
  const marketAcc = await (program.account as any).market.fetch(marketPda);
  const creatorFeePk = new PublicKey(marketAcc.creatorFeeAccount);
  await ensureAssociatedTokenAccount(
    connection,
    wallet,
    collateralMint,
    treasuryWallet,
    collateralTokenProgram
  );
  const creatorPk = new PublicKey(marketAcc.creator);
  await ensureAssociatedTokenAccount(
    connection,
    wallet,
    collateralMint,
    creatorPk,
    collateralTokenProgram
  );

  const rentTopOpts = {
    headroomLamports: isToken2022Program(collateralTokenProgram)
      ? TOKEN_2022_RENT_HEADROOM_LAMPORTS
      : 0,
  };

  let topUpSum = 0;
  // treasuryWallet is the SOL system account — the stake ix sends platformFeeLamports
  // directly to it, so it must be rent-exempt on its own (not just its token ATA).
  for (const pk of [userCollateral, platformTreasuryAta, creatorFeePk, vaultPda]) {
    topUpSum += await rentTopUpLamportsNeeded(connection, pk, rentTopOpts);
  }
  topUpSum += await rentTopUpLamportsNeeded(connection, treasuryWallet);
  const positionInfo = await connection.getAccountInfo(position, 'confirmed');
  const newPositionRent = positionInfo
    ? 0
    : await connection.getMinimumBalanceForRentExemption(
        PARIMUTUEL_POSITION_ACCOUNT_LEN
      );
  const platformFeeLamports = new BN(globalConfig.platformFeeLamports).toNumber();
  const payerMinRemaining = await connection.getMinimumBalanceForRentExemption(0);
  // Extra when we send rent top-ups in a separate tx before stake.
  const txFeeBuffer = rentTopOpts.headroomLamports > 0 ? 120_000 : 50_000;
  const requiredFromPayer =
    topUpSum +
    newPositionRent +
    platformFeeLamports +
    payerMinRemaining +
    txFeeBuffer;
  const payer = wallet.publicKey;
  const balance = await connection.getBalance(payer, 'confirmed');
  if (balance < requiredFromPayer) {
    throw new Error(
      `Insufficient SOL: this stake needs about ${(requiredFromPayer / LAMPORTS_PER_SOL).toFixed(4)} SOL ` +
        'for ATA rent top-ups, initializing your position (first stake on this outcome), ' +
        `the configured platform SOL fee (${platformFeeLamports} lamports), and the minimum left in your wallet. ` +
        `You have ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`
    );
  }

  const stakeIx = await program.methods
    .parimutuelStake({
      marketId,
      outcomeIndex,
      amount,
    })
    .accounts({
      user: wallet.publicKey,
      market: marketPda,
      parimutuelState,
      position,
      vault: vaultPda,
      collateralMint,
      userCollateralAccount: userCollateral,
      creatorFeeAccount: creatorFeePk,
      globalConfig: globalConfigPda,
      platformTreasuryWallet: treasuryWallet,
      platformTreasuryAta,
      allowedMint,
      collateralTokenProgram,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const topUpTx = new Transaction();
  for (const pk of [userCollateral, platformTreasuryAta, creatorFeePk, vaultPda]) {
    const top = await maybeRentTopUpInstruction(connection, pk, payer, rentTopOpts);
    if (top) topUpTx.add(top);
  }
  // Ensure the treasury SOL wallet itself is rent-exempt (no headroom needed here).
  const treasuryWalletTop = await maybeRentTopUpInstruction(connection, treasuryWallet, payer);
  if (treasuryWalletTop) topUpTx.add(treasuryWalletTop);

  const provider = program.provider as AnchorProvider;
  if (topUpTx.instructions.length > 0) {
    await provider.sendAndConfirm(topUpTx, [], PARIMUTUEL_SEND_OPTS);
  }
  await provider.sendAndConfirm(
    new Transaction().add(stakeIx),
    [],
    PARIMUTUEL_SEND_OPTS
  );
}

export async function parimutuelWithdrawTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN,
  collateralMint: PublicKey,
  outcomeIndex: number,
  amount: BN
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet required');
  }
  const collateralTokenProgram = await getMintTokenProgram(
    connection,
    collateralMint
  );
  const userCollateral = ataAddress(
    collateralMint,
    wallet.publicKey,
    collateralTokenProgram
  );
  await ensureAssociatedTokenAccount(
    connection,
    wallet,
    collateralMint,
    wallet.publicKey,
    collateralTokenProgram
  );
  const globalConfigPda = deriveGlobalConfig(program.programId);
  const globalConfig = await (program.account as any).globalConfig.fetch(
    globalConfigPda
  );
  const treasuryWallet = globalConfig.platformTreasury as PublicKey;
  const platformTreasuryAta = ataAddress(
    collateralMint,
    treasuryWallet,
    collateralTokenProgram
  );
  await ensureAssociatedTokenAccount(
    connection,
    wallet,
    collateralMint,
    treasuryWallet,
    collateralTokenProgram
  );

  const parimutuelState = deriveParimutuelState(program.programId, marketPda);
  const position = deriveParimutuelPosition(
    program.programId,
    marketPda,
    wallet.publicKey,
    outcomeIndex
  );
  const vaultPda = deriveVault(program.programId, marketPda);
  const marketAcc = await (program.account as any).market.fetch(marketPda);
  const creatorFeePk = new PublicKey(marketAcc.creatorFeeAccount);
  const creatorPk = new PublicKey(marketAcc.creator);
  await ensureAssociatedTokenAccount(
    connection,
    wallet,
    collateralMint,
    creatorPk,
    collateralTokenProgram
  );

  const rentTopOpts = {
    headroomLamports: isToken2022Program(collateralTokenProgram)
      ? TOKEN_2022_RENT_HEADROOM_LAMPORTS
      : 0,
  };

  const withdrawIx = await program.methods
    .parimutuelWithdraw({
      marketId,
      outcomeIndex,
      amount,
    })
    .accounts({
      user: wallet.publicKey,
      market: marketPda,
      creatorFeeAccount: creatorFeePk,
      parimutuelState,
      position,
      vault: vaultPda,
      collateralMint,
      userCollateralAccount: userCollateral,
      globalConfig: globalConfigPda,
      platformTreasuryWallet: treasuryWallet,
      platformTreasuryAta,
      collateralTokenProgram,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const topUpTx = new Transaction();
  const payer = wallet.publicKey;
  for (const pk of [userCollateral, platformTreasuryAta, creatorFeePk, vaultPda]) {
    const top = await maybeRentTopUpInstruction(connection, pk, payer, rentTopOpts);
    if (top) topUpTx.add(top);
  }
  const treasuryWalletTop = await maybeRentTopUpInstruction(connection, treasuryWallet, payer);
  if (treasuryWalletTop) topUpTx.add(treasuryWalletTop);

  const provider = program.provider as AnchorProvider;
  if (topUpTx.instructions.length > 0) {
    await provider.sendAndConfirm(topUpTx, [], PARIMUTUEL_SEND_OPTS);
  }
  await provider.sendAndConfirm(
    new Transaction().add(withdrawIx),
    [],
    PARIMUTUEL_SEND_OPTS
  );
}

export async function parimutuelClaimTx(
  connection: Connection,
  wallet: WalletContextState,
  marketPda: PublicKey,
  marketId: BN,
  collateralMint: PublicKey,
  outcomeIndex: number
): Promise<void> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet required');
  }
  const collateralTokenProgram = await getMintTokenProgram(
    connection,
    collateralMint
  );
  const userCollateral = ataAddress(
    collateralMint,
    wallet.publicKey,
    collateralTokenProgram
  );
  await ensureAssociatedTokenAccount(
    connection,
    wallet,
    collateralMint,
    wallet.publicKey,
    collateralTokenProgram
  );
  const parimutuelState = deriveParimutuelState(program.programId, marketPda);
  const position = deriveParimutuelPosition(
    program.programId,
    marketPda,
    wallet.publicKey,
    outcomeIndex
  );
  const vaultPda = deriveVault(program.programId, marketPda);

  const rentTopOpts = {
    headroomLamports: isToken2022Program(collateralTokenProgram)
      ? TOKEN_2022_RENT_HEADROOM_LAMPORTS
      : 0,
  };

  const claimIx = await program.methods
    .parimutuelClaim({
      marketId,
      outcomeIndex,
    })
    .accounts({
      user: wallet.publicKey,
      market: marketPda,
      parimutuelState,
      position,
      vault: vaultPda,
      collateralMint,
      userCollateralAccount: userCollateral,
      collateralTokenProgram,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const topUpTx = new Transaction();
  const payer = wallet.publicKey;
  for (const pk of [userCollateral, vaultPda]) {
    const top = await maybeRentTopUpInstruction(
      connection,
      pk,
      payer,
      rentTopOpts
    );
    if (top) topUpTx.add(top);
  }

  const provider = program.provider as AnchorProvider;
  if (topUpTx.instructions.length > 0) {
    await provider.sendAndConfirm(topUpTx, [], PARIMUTUEL_SEND_OPTS);
  }
  await provider.sendAndConfirm(
    new Transaction().add(claimIx),
    [],
    PARIMUTUEL_SEND_OPTS
  );
}

/**
 * Create or update the caller's UserProfile.
 * The verified flag is preserved on update (set only by the platform authority).
 */
export async function upsertUserProfile(
  connection: Connection,
  wallet: WalletContextState,
  displayName: string,
  url: string
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const program = await getProgram(connection, wallet);
  const profilePda = deriveUserProfile(program.programId, wallet.publicKey);

  return (program.methods as any)
    .upsertUserProfile(displayName, url)
    .accounts({
      userProfile: profilePda,
      wallet: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

/**
 * Close the caller's UserProfile and reclaim rent.
 */
export async function closeUserProfile(
  connection: Connection,
  wallet: WalletContextState
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const program = await getProgram(connection, wallet);
  const profilePda = deriveUserProfile(program.programId, wallet.publicKey);

  return (program.methods as any)
    .closeUserProfile()
    .accounts({
      userProfile: profilePda,
      wallet: wallet.publicKey,
    })
    .rpc();
}

/**
 * Set or unset the verified flag on a target wallet's profile.
 * Caller must be the platform primary or secondary authority.
 */
export async function verifyUserProfile(
  connection: Connection,
  wallet: WalletContextState,
  targetWallet: PublicKey,
  verified: boolean
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const program = await getProgram(connection, wallet);
  const profilePda = deriveUserProfile(program.programId, targetWallet);
  const globalConfigPda = deriveGlobalConfig(program.programId);

  return (program.methods as any)
    .verifyUserProfile(verified)
    .accounts({
      userProfile: profilePda,
      targetWallet,
      authority: wallet.publicKey,
      globalConfig: globalConfigPda,
    })
    .rpc();
}
