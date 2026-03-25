import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from '@solana/spl-token';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
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

export { TOKEN_PROGRAM_ID };
