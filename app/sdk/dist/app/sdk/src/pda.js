"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveMarketCategory = exports.deriveUserProfile = exports.deriveAllOutcomeTallies = exports.deriveOutcomeTally = exports.deriveResolutionVote = exports.deriveAllResolvers = exports.deriveResolver = exports.deriveAllOutcomeMints = exports.deriveOutcomeMint = exports.deriveParimutuelPosition = exports.deriveParimutuelState = exports.deriveVault = exports.deriveMarket = exports.deriveAllowedMint = exports.deriveGlobalConfig = void 0;
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
/** Parimutuel pool PDA — seeds: `["pari", market]`. */
const deriveParimutuelState = (programId, market) => web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('pari'), market.toBuffer()], programId)[0];
exports.deriveParimutuelState = deriveParimutuelState;
/** User stake position — seeds: `["pari-pos", market, user, outcome_index]`. */
const deriveParimutuelPosition = (programId, market, user, outcomeIndex) => web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('pari-pos'), market.toBuffer(), user.toBuffer(), Buffer.from([outcomeIndex])], programId)[0];
exports.deriveParimutuelPosition = deriveParimutuelPosition;
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
/** Per-outcome resolution vote counter PDA (0–7). */
const deriveOutcomeTally = (programId, market, outcomeIndex) => web3_js_1.PublicKey.findProgramAddressSync([market.toBuffer(), Buffer.from('outcome-tally'), Buffer.from([outcomeIndex])], programId)[0];
exports.deriveOutcomeTally = deriveOutcomeTally;
/** All eight outcome tally PDAs (unused outcome indices may never be initialized). */
const deriveAllOutcomeTallies = (programId, market) => Array.from({ length: 8 }, (_, i) => (0, exports.deriveOutcomeTally)(programId, market, i));
exports.deriveAllOutcomeTallies = deriveAllOutcomeTallies;
/** Derive the UserProfile PDA for a given wallet address. Seeds: ["user-profile", wallet]. */
const deriveUserProfile = (programId, wallet) => web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('user-profile'), wallet.toBuffer()], programId)[0];
exports.deriveUserProfile = deriveUserProfile;
/** Market category PDA — seeds: `["market-category", category_id u64 LE]`. */
const deriveMarketCategory = (programId, categoryId) => web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('market-category'), categoryId.toArrayLike(Buffer, 'le', 8)], programId)[0];
exports.deriveMarketCategory = deriveMarketCategory;
//# sourceMappingURL=pda.js.map