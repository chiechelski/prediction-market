"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveResolutionVote = exports.deriveAllResolvers = exports.deriveResolver = exports.deriveAllOutcomeMints = exports.deriveOutcomeMint = exports.deriveVault = exports.deriveMarket = exports.deriveAllowedMint = exports.deriveGlobalConfig = void 0;
const web3_js_1 = require("@solana/web3.js");
/** Derive the GlobalConfig PDA. */
const deriveGlobalConfig = (programId) => web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('global-config')], programId)[0];
exports.deriveGlobalConfig = deriveGlobalConfig;
/** Derive the AllowedMint PDA for a given collateral mint. */
const deriveAllowedMint = (programId, mint) => web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('allowed-mint'), mint.toBuffer()], programId)[0];
exports.deriveAllowedMint = deriveAllowedMint;
/** Derive the Market PDA for a given creator + market ID. */
const deriveMarket = (programId, creator, marketId) => web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('market'), creator.toBuffer(), marketId.toArrayLike(Buffer, 'le', 8)], programId)[0];
exports.deriveMarket = deriveMarket;
/** Derive the collateral vault PDA for a market. */
const deriveVault = (programId, market) => web3_js_1.PublicKey.findProgramAddressSync([market.toBuffer(), Buffer.from('vault')], programId)[0];
exports.deriveVault = deriveVault;
/** Derive the outcome mint PDA for a market and outcome index (0–7). */
const deriveOutcomeMint = (programId, market, index) => web3_js_1.PublicKey.findProgramAddressSync([market.toBuffer(), Buffer.from('outcome-mint'), Buffer.from([index])], programId)[0];
exports.deriveOutcomeMint = deriveOutcomeMint;
/** Derive all 8 outcome mint PDAs for a market. */
const deriveAllOutcomeMints = (programId, market) => Array.from({ length: 8 }, (_, i) => (0, exports.deriveOutcomeMint)(programId, market, i));
exports.deriveAllOutcomeMints = deriveAllOutcomeMints;
/** Derive the Resolver PDA for a market and resolver index (0–7). */
const deriveResolver = (programId, market, index) => web3_js_1.PublicKey.findProgramAddressSync([market.toBuffer(), Buffer.from('resolver'), Buffer.from([index])], programId)[0];
exports.deriveResolver = deriveResolver;
/** Derive all 8 resolver PDAs for a market. */
const deriveAllResolvers = (programId, market) => Array.from({ length: 8 }, (_, i) => (0, exports.deriveResolver)(programId, market, i));
exports.deriveAllResolvers = deriveAllResolvers;
/** Derive the ResolutionVote PDA for a market and resolver index (0–7). */
const deriveResolutionVote = (programId, market, resolverIndex) => web3_js_1.PublicKey.findProgramAddressSync([market.toBuffer(), Buffer.from('vote'), Buffer.from([resolverIndex])], programId)[0];
exports.deriveResolutionVote = deriveResolutionVote;
//# sourceMappingURL=pda.js.map