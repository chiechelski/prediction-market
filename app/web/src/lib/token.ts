import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from '@solana/spl-token';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';

/** Mint account owner = SPL Token or Token-2022 program id. */
export async function getMintTokenProgram(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint account not found: ${mint.toBase58()}`);
  return info.owner;
}

export function ataAddress(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey
): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

/**
 * Ensure the owner's ATA for `mint` exists; returns its address.
 * Signs with `wallet` as payer for the create instruction.
 */
export async function ensureAssociatedTokenAccount(
  connection: Connection,
  wallet: WalletContextState,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey
): Promise<PublicKey> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }
  const ata = ataAddress(mint, owner, tokenProgram);
  const acc = await connection.getAccountInfo(ata);
  if (acc) return ata;

  const ix = createAssociatedTokenAccountInstruction(
    wallet.publicKey,
    ata,
    owner,
    mint,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const tx = new Transaction().add(ix);
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
  return ata;
}

/** Read raw token amount for display (best-effort). */
export async function getTokenBalanceRaw(
  connection: Connection,
  ata: PublicKey,
  tokenProgram: PublicKey
): Promise<bigint> {
  try {
    const acct = await getAccount(connection, ata, undefined, tokenProgram);
    return acct.amount;
  } catch {
    return 0n;
  }
}

export type RentTopUpOptions = {
  /**
   * Extra lamports required on top of `getMinimumBalanceForRentExemption(data.length)`.
   * Use for Token-2022: some ATAs sit exactly at the RPC-reported minimum but still fail
   * the runtime rent check after CPIs (often surfacing as "account (6) insufficient rent"
   * when that account is the creator-fee ATA in the compiled message).
   */
  headroomLamports?: number;
};

/**
 * Returns a `SystemProgram.transfer` if `account` is below its rent-exempt minimum.
 *
 * Works for both token accounts (already exist) and system wallets that may have never
 * received SOL: a non-existent account is treated as 0 lamports / 0 data bytes.
 * This matters for the platform treasury wallet — the stake instruction sends SOL fees
 * directly to it, so it must be rent-exempt on its own (not just via its token ATA).
 */
export async function maybeRentTopUpInstruction(
  connection: Connection,
  account: PublicKey,
  payer: PublicKey,
  options?: RentTopUpOptions
): Promise<TransactionInstruction | null> {
  const headroom = options?.headroomLamports ?? 0;
  const info = await connection.getAccountInfo(account, 'confirmed');
  const currentLamports = info?.lamports ?? 0;
  const dataLen = info?.data.length ?? 0;
  const min =
    (await connection.getMinimumBalanceForRentExemption(dataLen)) + headroom;
  if (currentLamports >= min) return null;
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: account,
    lamports: min - currentLamports,
  });
}

/** Lamports required to reach the target minimum (0 if already there or account missing). */
export async function rentTopUpLamportsNeeded(
  connection: Connection,
  account: PublicKey,
  options?: RentTopUpOptions
): Promise<number> {
  const headroom = options?.headroomLamports ?? 0;
  const info = await connection.getAccountInfo(account, 'confirmed');
  const currentLamports = info?.lamports ?? 0;
  const dataLen = info?.data.length ?? 0;
  const min =
    (await connection.getMinimumBalanceForRentExemption(dataLen)) + headroom;
  return Math.max(0, min - currentLamports);
}

/**
 * If `owner` has no collateral ATA for `mint` yet, returns a single
 * `createAssociatedTokenAccount` instruction (payer funds rent). Otherwise returns no instructions.
 * Use when bundling `create_market` so creator-fee and treasury fee ATAs exist before stakes pay them.
 */
export async function instructionsToCreateCollateralAtaIfMissing(
  connection: Connection,
  payer: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey
): Promise<{ ata: PublicKey; instructions: TransactionInstruction[] }> {
  const ata = ataAddress(mint, owner, tokenProgram);
  const info = await connection.getAccountInfo(ata, 'confirmed');
  if (info) {
    return { ata, instructions: [] };
  }
  return {
    ata,
    instructions: [
      createAssociatedTokenAccountInstruction(
        payer,
        ata,
        owner,
        mint,
        tokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
    ],
  };
}

/** Headroom applied to Token-2022 token accounts when topping up rent before CPI-heavy txs. */
export const TOKEN_2022_RENT_HEADROOM_LAMPORTS = 500_000;

export function isToken2022Program(program: PublicKey): boolean {
  return program.equals(TOKEN_2022_PROGRAM_ID);
}

export { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID };
