/**
 * Creates (or reuses) a local test-USDC SPL token mint and mints tokens to the
 * configured wallet plus any extra addresses passed on the command line.
 *
 * Usage (from prediction_market/):
 *   yarn script:usdc                          # mint 1 000 000 tUSDC to your wallet
 *   yarn script:usdc <addr1> <addr2> ...      # also mint to extra addresses
 *
 * The mint keypair is saved to tests/keys/test-usdc-mint.json so the address
 * is the same on every run (as long as the validator's ledger is preserved).
 * If the mint account already exists on-chain, no re-creation happens — tokens
 * are just minted into the requested ATAs.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// ─── Config ────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8899';
const DECIMALS = 6; // same as real USDC
const MINT_AMOUNT_UI = 1_000_000; // 1 000 000 tUSDC per recipient

const MINT_KEYPAIR_PATH = path.resolve(
  __dirname,
  '../tests/keys/test-usdc-mint.json'
);
const PAYER_KEYPAIR_PATH =
  process.env.ANCHOR_WALLET ??
  path.join(process.env.HOME ?? '~', '.config/solana/id.json');

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadOrCreateMintKeypair(): Keypair {
  if (fs.existsSync(MINT_KEYPAIR_PATH)) {
    return loadKeypair(MINT_KEYPAIR_PATH);
  }
  const kp = Keypair.generate();
  fs.mkdirSync(path.dirname(MINT_KEYPAIR_PATH), { recursive: true });
  fs.writeFileSync(MINT_KEYPAIR_PATH, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`Generated new mint keypair → ${MINT_KEYPAIR_PATH}`);
  return kp;
}

async function mintToAddress(
  connection: Connection,
  payer: Keypair,
  mintPubkey: PublicKey,
  recipient: PublicKey,
  amountRaw: bigint
): Promise<void> {
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPubkey,
    recipient,
    false,
    'confirmed',
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );
  await mintTo(
    connection,
    payer,
    mintPubkey,
    ata.address,
    payer, // mint authority = payer
    amountRaw,
    [],
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );
  console.log(
    `  ✓ Minted ${MINT_AMOUNT_UI.toLocaleString()} tUSDC → ${recipient.toBase58()}`
  );
  console.log(`    ATA: ${ata.address.toBase58()}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const payer = loadKeypair(PAYER_KEYPAIR_PATH);
  const mintKeypair = loadOrCreateMintKeypair();

  console.log('\n=== Test USDC setup ===');
  console.log(`RPC          : ${RPC_URL}`);
  console.log(`Payer        : ${payer.publicKey.toBase58()}`);
  console.log(`Mint address : ${mintKeypair.publicKey.toBase58()}`);

  // Create or verify mint
  let mintExists = false;
  try {
    const info = await getMint(connection, mintKeypair.publicKey, 'confirmed', TOKEN_PROGRAM_ID);
    mintExists = true;
    console.log(`\nMint already exists (decimals=${info.decimals}, authority=${info.mintAuthority?.toBase58()})`);
  } catch {
    // not found — create it
  }

  if (!mintExists) {
    console.log('\nCreating mint…');
    await createMint(
      connection,
      payer,
      payer.publicKey,   // mint authority
      payer.publicKey,   // freeze authority
      DECIMALS,
      mintKeypair,
      { commitment: 'confirmed' },
      TOKEN_PROGRAM_ID
    );
    console.log(`Mint created: ${mintKeypair.publicKey.toBase58()}`);
  }

  // Recipients: payer + any extra addresses from CLI args
  const extraArgs = process.argv.slice(2);
  const extraRecipients: PublicKey[] = [];
  for (const arg of extraArgs) {
    try {
      extraRecipients.push(new PublicKey(arg));
    } catch {
      console.warn(`Skipping invalid pubkey argument: ${arg}`);
    }
  }

  const recipients = [payer.publicKey, ...extraRecipients];
  const amountRaw = BigInt(MINT_AMOUNT_UI) * BigInt(10 ** DECIMALS);

  console.log(`\nMinting to ${recipients.length} address(es)…`);
  for (const recipient of recipients) {
    await mintToAddress(connection, payer, mintKeypair.publicKey, recipient, amountRaw);
  }

  console.log('\n✅ Done.');
  console.log(`\nMint address to use in the UI / Anchor.toml:`);
  console.log(`  ${mintKeypair.publicKey.toBase58()}`);
  console.log(`\nTo add it to the platform allowlist, go to the Platform page in the UI`);
  console.log(`or run the add-allowed-mint script (if available).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
