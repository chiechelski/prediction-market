import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

/**
 * Rough minimum SOL (lamports) to create a market: possible new ATA rent,
 * several program txs, and new on-chain accounts. Below this, signing often
 * fails with a generic wallet error.
 */
export const MIN_LAMPORTS_CREATE_MARKET = Math.floor(0.005 * LAMPORTS_PER_SOL);

export function formatSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(6);
}

export function formatInsufficientSolMessage(
  balanceLamports: number,
  minLamports: number = MIN_LAMPORTS_CREATE_MARKET
): string {
  const sol = formatSol(balanceLamports);
  const minSol = (minLamports / LAMPORTS_PER_SOL).toFixed(4);
  return `Insufficient SOL: you need at least ~${minSol} SOL for network fees and account rent to create a market. Your balance is ${sol} SOL. Add SOL to this wallet and try again.`;
}

export async function assertSolBalanceForPayer(
  connection: Connection,
  payer: PublicKey,
  minLamports: number = MIN_LAMPORTS_CREATE_MARKET
): Promise<void> {
  const balance = await connection.getBalance(payer);
  if (balance < minLamports) {
    throw new Error(formatInsufficientSolMessage(balance, minLamports));
  }
}
