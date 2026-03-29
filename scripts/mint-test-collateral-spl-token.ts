/**
 * Mints from the classic SPL Token test collateral mint at
 * tests/keys/test-usdc-spl-mint.json. Run `yarn script:spl-token` first if needed.
 *
 * Usage:
 *   yarn script:spl-token:mint <addr1> [addr2] ... [--amount N]
 */

import * as fs from "fs";
import { Connection, PublicKey } from "@solana/web3.js";
import {
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
} from "./collateral-script-env";

const DEFAULT_AMOUNT_UI = 100_000;

async function main() {
  const rawArgs = process.argv.slice(2);
  let amountUi = DEFAULT_AMOUNT_UI;
  const addresses: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === "--amount" && rawArgs[i + 1]) {
      amountUi = Number(rawArgs[++i]);
    } else {
      addresses.push(rawArgs[i]!);
    }
  }

  if (addresses.length === 0) {
    console.error(
      "Usage: yarn script:spl-token:mint <address> [address2] ... [--amount N]",
    );
    process.exit(1);
  }

  if (!fs.existsSync(SPL_TOKEN_MINT_KEYPAIR_PATH)) {
    console.error(`Mint keypair not found at ${SPL_TOKEN_MINT_KEYPAIR_PATH}`);
    console.error("Run yarn script:spl-token first to create the mint.");
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(PAYER_KEYPAIR_PATH);
  const mintKeypair = loadKeypair(SPL_TOKEN_MINT_KEYPAIR_PATH);
  const amountRaw = BigInt(amountUi) * BigInt(10 ** COLLATERAL_DECIMALS);

  console.log(`\nMint   : ${mintKeypair.publicKey.toBase58()}`);
  console.log("Program: SPL Token (classic)");
  console.log(`Amount : ${amountUi.toLocaleString()} (whole tokens) per address\n`);

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
      "confirmed",
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID,
    );

    await mintTo(
      connection,
      payer,
      mintKeypair.publicKey,
      ata.address,
      payer,
      amountRaw,
      [],
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID,
    );

    console.log(`  ✓ ${amountUi.toLocaleString()} → ${recipient.toBase58()}`);
    console.log(`    ATA: ${ata.address.toBase58()}`);
  }

  console.log("\n✅ Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
