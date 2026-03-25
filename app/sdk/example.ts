/**
 * Example: PDA derivation and SDK usage.
 *
 * Build the program first: from repo root run `anchor build`.
 * Then from app/sdk: `yarn build && node -r esbuild-register example.ts`
 * Or use ts-node: `npx ts-node -P tsconfig.json example.ts`
 *
 * For full integration (create market, mint, resolve), run: anchor test
 */

import { PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';
import {
  deriveGlobalConfig,
  deriveAllowedMint,
  deriveMarket,
  deriveVault,
  deriveOutcomeMint,
  deriveResolver,
  deriveResolutionVote,
} from './src/pda';

const PROGRAM_ID = new PublicKey('C5QvWnGHeC6o7N68heWFKPvC35eggZ9Mrgqzj86WwrBv');
const creator = PublicKey.default; // replace with real pubkey in real usage
const marketId = new BN(12345);
const collateralMint = PublicKey.default;

function main() {
  const globalConfig = deriveGlobalConfig(PROGRAM_ID);
  const allowedMint = deriveAllowedMint(PROGRAM_ID, collateralMint);
  const marketPda = deriveMarket(PROGRAM_ID, creator, marketId);
  const vaultPda = deriveVault(PROGRAM_ID, marketPda);
  const outcome0 = deriveOutcomeMint(PROGRAM_ID, marketPda, 0);
  const resolver0 = deriveResolver(PROGRAM_ID, marketPda, 0);
  const vote0 = deriveResolutionVote(PROGRAM_ID, marketPda, 0);

  console.log('Global config:', globalConfig.toBase58());
  console.log('Market PDA:', marketPda.toBase58());
  console.log('Vault PDA:', vaultPda.toBase58());
  console.log('Outcome mint 0:', outcome0.toBase58());
  console.log('Resolver 0:', resolver0.toBase58());
  console.log('Resolution vote 0:', vote0.toBase58());
}

main();
