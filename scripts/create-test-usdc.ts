/**
 * Creates (or reuses) a local test-USDC mint and mints tokens to the
 * configured wallet plus any extra addresses passed on the command line.
 *
 * New mints use **Token-2022** with MetadataPointer + on-mint TokenMetadata
 * (name/symbol), so UIs can show **tUSDC** instead of a raw pubkey — same
 * pattern as production tokens that use the metadata extension.
 *
 * Usage (from prediction_market/):
 *   yarn script:usdc                          # mint 1 000 000 tUSDC to your wallet
 *   yarn script:usdc <addr1> <addr2> ...      # also mint to extra addresses
 *
 * Optional env (only for **new** mints):
 *   TUSDC_NAME   (default: Test USD Coin)
 *   TUSDC_SYMBOL (default: tUSDC)
 *   TUSDC_URI    (default: empty)
 *
 * The mint keypair is saved to tests/keys/test-usdc-mint.json so the address
 * is the same on every run (as long as the validator's ledger is preserved).
 * If the mint account already exists on-chain, no re-creation happens — tokens
 * are just minted into the requested ATAs (classic SPL or Token-2022).
 */

import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createInitializeInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  getMint,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  ExtensionType,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { pack, type TokenMetadata } from "@solana/spl-token-metadata";

// ─── Config ────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const DECIMALS = 6; // same as real USDC
const MINT_AMOUNT_UI = 1_000_000; // 1 000 000 tUSDC per recipient

const TOKEN_NAME = process.env.TUSDC_NAME ?? "Test USD Coin";
const TOKEN_SYMBOL = process.env.TUSDC_SYMBOL ?? "tUSDC";
const TOKEN_URI = process.env.TUSDC_URI ?? "";

const MINT_KEYPAIR_PATH = path.resolve(
  __dirname,
  "../tests/keys/test-usdc-mint.json",
);
const PAYER_KEYPAIR_PATH =
  process.env.ANCHOR_WALLET ??
  path.join(process.env.HOME ?? "~", ".config/solana/id.json");

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
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

async function tokenProgramForMint(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) return TOKEN_PROGRAM_ID;
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

async function createToken2022MintWithMetadata(
  connection: Connection,
  payer: Keypair,
  mintKeypair: Keypair,
): Promise<void> {
  const tokenMetadata: TokenMetadata = {
    mint: mintKeypair.publicKey,
    updateAuthority: payer.publicKey,
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    uri: TOKEN_URI,
    additionalMetadata: [],
  };

  const metadataPackedLen = pack(tokenMetadata).length;
  const mintLen = getMintLen([ExtensionType.MetadataPointer], {
    [ExtensionType.TokenMetadata]: metadataPackedLen,
  });

  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      DECIMALS,
      payer.publicKey,
      payer.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mintKeypair.publicKey,
      updateAuthority: payer.publicKey,
      mint: mintKeypair.publicKey,
      mintAuthority: payer.publicKey,
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      uri: TOKEN_URI,
    }),
  );

  await sendAndConfirmTransaction(connection, tx, [payer, mintKeypair], {
    commitment: "confirmed",
  });
}

async function mintToAddress(
  connection: Connection,
  payer: Keypair,
  mintPubkey: PublicKey,
  recipient: PublicKey,
  amountRaw: bigint,
): Promise<void> {
  const programId = await tokenProgramForMint(connection, mintPubkey);
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPubkey,
    recipient,
    false,
    "confirmed",
    { commitment: "confirmed" },
    programId,
  );
  await mintTo(
    connection,
    payer,
    mintPubkey,
    ata.address,
    payer, // mint authority = payer
    amountRaw,
    [],
    { commitment: "confirmed" },
    programId,
  );
  console.log(
    `  ✓ Minted ${MINT_AMOUNT_UI.toLocaleString()} ${TOKEN_SYMBOL} → ${recipient.toBase58()}`,
  );
  console.log(`    ATA: ${ata.address.toBase58()}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(PAYER_KEYPAIR_PATH);
  const mintKeypair = loadOrCreateMintKeypair();

  console.log("\n=== Test USDC setup ===");
  console.log(`RPC          : ${RPC_URL}`);
  console.log(`Payer        : ${payer.publicKey.toBase58()}`);
  console.log(`Mint address : ${mintKeypair.publicKey.toBase58()}`);
  console.log(`Metadata     : "${TOKEN_NAME}" (${TOKEN_SYMBOL})`);

  // Create or verify mint
  let mintExists = false;
  try {
    const programId = await tokenProgramForMint(
      connection,
      mintKeypair.publicKey,
    );
    const info = await getMint(
      connection,
      mintKeypair.publicKey,
      "confirmed",
      programId,
    );
    mintExists = true;
    console.log(
      `\nMint already exists (program=${
        programId.equals(TOKEN_2022_PROGRAM_ID) ? "Token-2022" : "SPL Token"
      }, decimals=${
        info.decimals
      }, authority=${info.mintAuthority?.toBase58()})`,
    );
  } catch {
    // not found — create it
  }

  if (!mintExists) {
    console.log("\nCreating Token-2022 mint with on-chain metadata…");
    await createToken2022MintWithMetadata(connection, payer, mintKeypair);
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
    await mintToAddress(
      connection,
      payer,
      mintKeypair.publicKey,
      recipient,
      amountRaw,
    );
  }

  console.log("\n✅ Done.");
  console.log(`\nMint address to use in the UI / Anchor.toml:`);
  console.log(`  ${mintKeypair.publicKey.toBase58()}`);
  console.log(
    `\nTo add it to the platform allowlist, go to the Platform page in the UI`,
  );
  console.log(`or run the add-allowed-mint script (if available).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
