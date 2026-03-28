/**
 * Mints test-USDC tokens to one or more addresses using the existing mint at
 * tests/keys/test-usdc-mint.json.  Requires the mint to exist already
 * (run create-test-usdc first).
 *
 * Usage (from prediction_market/):
 *   yarn script:mint <addr1> [addr2] ...
 *   yarn script:mint <addr1> --amount 5000   # custom amount in whole tokens
 */

import * as fs from 'fs';
import * as path from 'path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8899';
const DECIMALS = 6;
const DEFAULT_AMOUNT_UI = 100_000;

const MINT_KEYPAIR_PATH = path.resolve(
  __dirname,
  '../tests/keys/test-usdc-mint.json'
);
const PAYER_KEYPAIR_PATH =
  process.env.ANCHOR_WALLET ??
  path.join(process.env.HOME ?? '~', '.config/solana/id.json');

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function tokenProgramForMint(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) return TOKEN_PROGRAM_ID;
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

async function main() {
  // Parse args: pull out --amount N, rest are pubkeys
  const rawArgs = process.argv.slice(2);
  let amountUi = DEFAULT_AMOUNT_UI;
  const addresses: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--amount' && rawArgs[i + 1]) {
      amountUi = Number(rawArgs[++i]);
    } else {
      addresses.push(rawArgs[i]!);
    }
  }

  if (addresses.length === 0) {
    console.error('Usage: yarn script:mint <address> [address2] ... [--amount N]');
    process.exit(1);
  }

  if (!fs.existsSync(MINT_KEYPAIR_PATH)) {
    console.error(`Mint keypair not found at ${MINT_KEYPAIR_PATH}`);
    console.error('Run yarn script:usdc first to create the mint.');
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, 'confirmed');
  const payer = loadKeypair(PAYER_KEYPAIR_PATH);
  const mintKeypair = loadKeypair(MINT_KEYPAIR_PATH);
  const amountRaw = BigInt(amountUi) * BigInt(10 ** DECIMALS);
  const programId = await tokenProgramForMint(
    connection,
    mintKeypair.publicKey
  );

  console.log(`\nMint  : ${mintKeypair.publicKey.toBase58()}`);
  console.log(
    `Program: ${programId.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL Token'}`
  );
  console.log(`Amount: ${amountUi.toLocaleString()} tUSDC per address\n`);

  for (const addr of addresses) {
    let recipient: PublicKey;
    try {
      recipient = new PublicKey(addr);
    } catch {
      console.warn(`  ✗ Invalid pubkey, skipping: ${addr}`);
      continue;
    }

    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintKeypair.publicKey,
      recipient,
      false,
      'confirmed',
      { commitment: 'confirmed' },
      programId
    );

    await mintTo(
      connection,
      payer,
      mintKeypair.publicKey,
      ata.address,
      payer,
      amountRaw,
      [],
      { commitment: 'confirmed' },
      programId
    );

    console.log(`  ✓ ${amountUi.toLocaleString()} tUSDC → ${recipient.toBase58()}`);
    console.log(`    ATA: ${ata.address.toBase58()}`);
  }

  console.log('\n✅ Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
