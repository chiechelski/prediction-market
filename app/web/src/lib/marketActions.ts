import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
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
  deriveOutcomeTally,
  deriveResolutionVote,
  deriveUserProfile,
} from '@/lib/pda';
import { assertSolBalanceForPayer } from '@/lib/solBalance';
import {
  ataAddress,
  ensureAssociatedTokenAccount,
  getMintTokenProgram,
} from '@/lib/token';

export const DEFAULT_PUBKEY = new PublicKey(
  '11111111111111111111111111111111'
);

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

function padResolvers(keys: PublicKey[], numResolvers: number): PublicKey[] {
  const out: PublicKey[] = [];
  for (let i = 0; i < 8; i++) {
    out.push(i < numResolvers ? keys[i]! : DEFAULT_PUBKEY);
  }
  return out;
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
    platformFeeBps: number;
    collateralMint: PublicKey;
    /** First resolver is usually the connected wallet; length must equal numResolvers */
    resolverPubkeys: PublicKey[];
    title: string;
    /** Omit or `null` for uncategorized (`Pubkey::default()` on-chain). */
    marketCategory: PublicKey | null;
  }
): Promise<{ marketPda: PublicKey; vault: PublicKey }> {
  const program = await getProgram(connection, wallet);
  if (!wallet.publicKey) throw new Error('Wallet required');

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

  const creatorFeeAta = await ensureAssociatedTokenAccount(
    connection,
    wallet,
    params.collateralMint,
    creator,
    collateralTokenProgram
  );

  await program.methods
    .createMarket({
      marketId: params.marketId,
      outcomeCount: params.outcomeCount,
      resolutionThreshold: params.resolutionThreshold,
      closeAt: params.closeAt,
      creatorFeeBps: params.creatorFeeBps,
      platformFeeBps: params.platformFeeBps,
      numResolvers,
      title: params.title,
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
    .rpc();

  const resolverPdas = deriveAllResolvers(program.programId, marketPda);
  const resolverKeys = padResolvers(params.resolverPubkeys, numResolvers);

  await program.methods
    .initializeMarketResolvers({
      marketId: params.marketId,
      resolverPubkeys: resolverKeys,
      numResolvers,
    })
    .accounts({
      payer: creator,
      market: marketPda,
      systemProgram: SystemProgram.programId,
      resolver0: resolverPdas[0], resolver1: resolverPdas[1], resolver2: resolverPdas[2],
      resolver3: resolverPdas[3], resolver4: resolverPdas[4], resolver5: resolverPdas[5],
      resolver6: resolverPdas[6], resolver7: resolverPdas[7],
    })
    .rpc();

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

  const resolverPdas = deriveAllResolvers(program.programId, marketPda);
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

  await program.methods
    .voteResolution({
      marketId,
      outcomeIndex,
      resolverIndex,
    })
    .accounts({
      resolverSigner: wallet.publicKey,
      market: marketPda,
      resolver0: resolverPdas[0], resolver1: resolverPdas[1],
      resolver2: resolverPdas[2], resolver3: resolverPdas[3],
      resolver4: resolverPdas[4], resolver5: resolverPdas[5],
      resolver6: resolverPdas[6], resolver7: resolverPdas[7],
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

  const resolverPdas = deriveAllResolvers(program.programId, marketPda);
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

  await program.methods
    .revokeResolutionVote({
      marketId,
      resolverIndex,
      outcomeIndex,
    })
    .accounts({
      resolverSigner: wallet.publicKey,
      market: marketPda,
      resolver0: resolverPdas[0], resolver1: resolverPdas[1],
      resolver2: resolverPdas[2], resolver3: resolverPdas[3],
      resolver4: resolverPdas[4], resolver5: resolverPdas[5],
      resolver6: resolverPdas[6], resolver7: resolverPdas[7],
      resolutionVote,
      outcomeTally,
    })
    .rpc();
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

  const resolverPdas = deriveAllResolvers(program.programId, marketPda);

  await program.methods
    .closeMarketEarly({ marketId })
    .accounts({
      signer: wallet.publicKey,
      market: marketPda,
      resolver0: resolverPdas[0], resolver1: resolverPdas[1],
      resolver2: resolverPdas[2], resolver3: resolverPdas[3],
      resolver4: resolverPdas[4], resolver5: resolverPdas[5],
      resolver6: resolverPdas[6], resolver7: resolverPdas[7],
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

  const resolverPdas = deriveAllResolvers(program.programId, marketPda);

  await program.methods
    .voidMarket({ marketId })
    .accounts({
      signer: wallet.publicKey,
      market: marketPda,
      resolver0: resolverPdas[0], resolver1: resolverPdas[1],
      resolver2: resolverPdas[2], resolver3: resolverPdas[3],
      resolver4: resolverPdas[4], resolver5: resolverPdas[5],
      resolver6: resolverPdas[6], resolver7: resolverPdas[7],
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

/**
 * Fetch an on-chain UserProfile for any wallet.
 * Returns null when the account does not exist (profile not yet created).
 */
export async function fetchUserProfile(
  connection: Connection,
  wallet: WalletContextState,
  targetWallet: PublicKey
): Promise<UserProfileData | null> {
  const program = await getProgram(connection, wallet);
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
