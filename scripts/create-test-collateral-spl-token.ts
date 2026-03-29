/**
 * Creates (or reuses) a local test collateral mint on the **classic SPL Token**
 * program (`Tokenkeg...`), not Token-2022. No on-chain name/symbol metadata —
 * use the mint pubkey in UIs or your token list.
 *
 * Usage (from prediction_market/):
 *   yarn script:spl-token                          # mint 1 000 000 to your wallet
 *   yarn script:spl-token <addr1> <addr2> ...      # also mint to extra addresses
 *
 * Keypair: tests/keys/test-usdc-spl-mint.json
 *
 * Allowlist the mint via the Platform page (global authority).
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  COLLATERAL_DECIMALS,
  RPC_URL,
  SPL_TOKEN_MINT_KEYPAIR_PATH,
  PAYER_KEYPAIR_PATH,
  loadKeypair,
  loadOrCreateMintKeypair,
} from "./collateral-script-env";

const MINT_AMOUNT_UI = 1_000_000;
const TOKEN_LABEL = process.env.TUSDC_SPL_SYMBOL ?? "tUSDC-SPL";

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
    TOKEN_PROGRAM_ID,
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
    TOKEN_PROGRAM_ID,
  );
  console.log(
    `  ✓ Minted ${MINT_AMOUNT_UI.toLocaleString()} ${TOKEN_LABEL} → ${recipient.toBase58()}`,
  );
  console.log(`    ATA: ${ata.address.toBase58()}`);
}

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(PAYER_KEYPAIR_PATH);
  const mintKeypair = loadOrCreateMintKeypair(SPL_TOKEN_MINT_KEYPAIR_PATH);

  console.log("\n=== Test collateral (classic SPL Token) ===");
  console.log(`RPC          : ${RPC_URL}`);
  console.log(`Payer        : ${payer.publicKey.toBase58()}`);
  console.log(`Mint address : ${mintKeypair.publicKey.toBase58()}`);
  console.log(`Label (logs) : ${TOKEN_LABEL}`);

  let mintExists = false;
  try {
    const info = await getMint(
      connection,
      mintKeypair.publicKey,
      "confirmed",
      TOKEN_PROGRAM_ID,
    );
    mintExists = true;
    console.log(
      `\nMint already exists (SPL Token, decimals=${info.decimals}, authority=${info.mintAuthority?.toBase58()})`,
    );
  } catch {
    // create below
  }

  if (!mintExists) {
    console.log("\nCreating SPL Token mint…");
    await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      COLLATERAL_DECIMALS,
      mintKeypair,
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID,
    );
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
  console.log(`\nMint address (SPL Token):`);
  console.log(`  ${mintKeypair.publicKey.toBase58()}`);
  console.log(
    `\nAdd this mint on the Platform page (global authority) before creating markets.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
