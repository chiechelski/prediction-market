/**
 * Shared config and keypair helpers for local test collateral scripts
 * (Token-2022 vs classic SPL Token).
 */

import * as fs from "fs";
import * as path from "path";
import { Keypair } from "@solana/web3.js";

/** Same as production USDC-style tokens. */
export const COLLATERAL_DECIMALS = 6 as const;
export type CollateralDecimals = typeof COLLATERAL_DECIMALS;

export const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";

/** Deterministic Token-2022 test mint (metadata extensions). */
export const TOKEN2022_MINT_KEYPAIR_PATH = path.resolve(
  __dirname,
  "../tests/keys/test-usdc-mint.json",
);

/** Deterministic classic SPL Token program mint (no Token-2022 extensions). */
export const SPL_TOKEN_MINT_KEYPAIR_PATH = path.resolve(
  __dirname,
  "../tests/keys/test-usdc-spl-mint.json",
);

export const PAYER_KEYPAIR_PATH =
  process.env.ANCHOR_WALLET ??
  path.join(process.env.HOME ?? "~", ".config/solana/id.json");

export function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function loadOrCreateMintKeypair(filePath: string): Keypair {
  if (fs.existsSync(filePath)) {
    return loadKeypair(filePath);
  }
  const kp = Keypair.generate();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`Generated new mint keypair → ${filePath}`);
  return kp;
}
