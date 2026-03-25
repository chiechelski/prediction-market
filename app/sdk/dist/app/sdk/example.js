"use strict";
/**
 * Example: PDA derivation and SDK usage.
 *
 * Build the program first: from repo root run `anchor build`.
 * Then from app/sdk: `yarn build && node -r esbuild-register example.ts`
 * Or use ts-node: `npx ts-node -P tsconfig.json example.ts`
 *
 * For full integration (create market, mint, resolve), run: anchor test
 */
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = require("bn.js");
const pda_1 = require("./src/pda");
const PROGRAM_ID = new web3_js_1.PublicKey('C5QvWnGHeC6o7N68heWFKPvC35eggZ9Mrgqzj86WwrBv');
const creator = web3_js_1.PublicKey.default; // replace with real pubkey in real usage
const marketId = new bn_js_1.BN(12345);
const collateralMint = web3_js_1.PublicKey.default;
function main() {
    const globalConfig = (0, pda_1.deriveGlobalConfig)(PROGRAM_ID);
    const allowedMint = (0, pda_1.deriveAllowedMint)(PROGRAM_ID, collateralMint);
    const marketPda = (0, pda_1.deriveMarket)(PROGRAM_ID, creator, marketId);
    const vaultPda = (0, pda_1.deriveVault)(PROGRAM_ID, marketPda);
    const outcome0 = (0, pda_1.deriveOutcomeMint)(PROGRAM_ID, marketPda, 0);
    const resolver0 = (0, pda_1.deriveResolver)(PROGRAM_ID, marketPda, 0);
    const vote0 = (0, pda_1.deriveResolutionVote)(PROGRAM_ID, marketPda, 0);
    console.log('Global config:', globalConfig.toBase58());
    console.log('Market PDA:', marketPda.toBase58());
    console.log('Vault PDA:', vaultPda.toBase58());
    console.log('Outcome mint 0:', outcome0.toBase58());
    console.log('Resolver 0:', resolver0.toBase58());
    console.log('Resolution vote 0:', vote0.toBase58());
}
main();
//# sourceMappingURL=example.js.map