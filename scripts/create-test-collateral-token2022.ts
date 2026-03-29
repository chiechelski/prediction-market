/**
 * Creates (or reuses) a local test collateral mint using **Token-2022** with
 * MetadataPointer + on-mint TokenMetadata (name/symbol), so UIs can show **tUSDC**
 * instead of a raw pubkey.
 *
 * Usage (from prediction_market/):
 *   yarn script:token2022                          # mint 1 000 000 to your wallet
 *   yarn script:token2022 <addr1> <addr2> ...      # also mint to extra addresses
 *
 * Optional env (only for **new** mints):
 *   TUSDC_NAME   (default: Test USD Coin)
 *   TUSDC_SYMBOL (default: tUSDC)
 *   TUSDC_URI    (default: empty)
 *
 * Keypair: tests/keys/test-usdc-mint.json
 *
 * Allowlist the mint via the Platform page in the web app (global authority).
 */

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
  createInitializeMint2Instruction,
  getMint,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { pack, type TokenMetadata } from "@solana/spl-token-metadata";
import {
  COLLATERAL_DECIMALS,
  RPC_URL,
  TOKEN2022_MINT_KEYPAIR_PATH,
  PAYER_KEYPAIR_PATH,
  loadKeypair,
  loadOrCreateMintKeypair,
} from "./collateral-script-env";

const MINT_AMOUNT_UI = 1_000_000;

const TOKEN_NAME = process.env.TUSDC_NAME ?? "Test USD Coin";
const TOKEN_SYMBOL = process.env.TUSDC_SYMBOL ?? "tUSDC";
const TOKEN_URI = process.env.TUSDC_URI ?? "";

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
  const mintLenWithPointerOnly = getMintLen([ExtensionType.MetadataPointer]);
  const mintLenAfterMetadata = getMintLen([ExtensionType.MetadataPointer], {
    [ExtensionType.TokenMetadata]: metadataPackedLen,
  });
  const lamports = await connection.getMinimumBalanceForRentExemption(
    mintLenAfterMetadata,
  );

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLenWithPointerOnly,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMint2Instruction(
      mintKeypair.publicKey,
      COLLATERAL_DECIMALS,
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
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPubkey,
    recipient,
    false,
    "confirmed",
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID,
  );
  await mintTo(
    connection,
    payer,
    mintPubkey,
    ata.address,
    payer,
    amountRaw,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID,
  );
  console.log(
    `  ✓ Minted ${MINT_AMOUNT_UI.toLocaleString()} ${TOKEN_SYMBOL} → ${recipient.toBase58()}`,
  );
  console.log(`    ATA: ${ata.address.toBase58()}`);
}

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(PAYER_KEYPAIR_PATH);
  const mintKeypair = loadOrCreateMintKeypair(TOKEN2022_MINT_KEYPAIR_PATH);

  console.log("\n=== Test collateral (Token-2022) ===");
  console.log(`RPC          : ${RPC_URL}`);
  console.log(`Payer        : ${payer.publicKey.toBase58()}`);
  console.log(`Mint address : ${mintKeypair.publicKey.toBase58()}`);
  console.log(`Metadata     : "${TOKEN_NAME}" (${TOKEN_SYMBOL})`);

  let mintExists = false;
  try {
    const info = await getMint(
      connection,
      mintKeypair.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    mintExists = true;
    console.log(
      `\nMint already exists (Token-2022, decimals=${info.decimals}, authority=${info.mintAuthority?.toBase58()})`,
    );
  } catch {
    // not found — create it
  }

  if (!mintExists) {
    console.log("\nCreating Token-2022 mint with on-chain metadata…");
    await createToken2022MintWithMetadata(connection, payer, mintKeypair);
    console.log(`Mint created: ${mintKeypair.publicKey.toBase58()}`);
  }

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
  const amountRaw = BigInt(MINT_AMOUNT_UI) * BigInt(10 ** COLLATERAL_DECIMALS);

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
  console.log(`\nMint address (Token-2022):`);
  console.log(`  ${mintKeypair.publicKey.toBase58()}`);
  console.log(
    `\nAdd this mint on the Platform page (global authority) before creating markets.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
