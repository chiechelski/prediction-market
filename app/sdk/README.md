# Prediction Market SDK

TypeScript SDK for the [Prediction Market](../../programs/prediction_market) Anchor program on Solana.

## Setup

From the Anchor workspace root (e.g. `prediction_market/`):

1. Build the program and generate IDL + types:
   ```bash
   anchor build
   ```
2. Install SDK dependencies (from `app/sdk/`):
   ```bash
   cd app/sdk && yarn install
   ```
3. Build the SDK:
   ```bash
   yarn build
   ```

The SDK expects the program’s generated types at `target/types/prediction_market.ts`. Use `anchor build` (or `anchor test`) so that path exists before building the SDK.

## Usage

```ts
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PredictionMarket } from '../target/types/prediction_market';
import { PredictionMarketClient, deriveMarket, deriveVault } from '@prediction-market/sdk';
import { BN } from 'bn.js';

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>;

const client = new PredictionMarketClient(program);

// Admin
await client.initializeConfig({
  secondaryAuthority: secondaryAuthorityPubkey,
  depositPlatformFeeBps: 100,
  platformTreasuryWallet: platformTreasuryPubkey,
  platformFeeLamports: new BN(0),
  parimutuelPenaltyProtocolShareBps: 2000,
  parimutuelWithdrawPlatformFeeBps: 0,
});
await client.addAllowedCollateralMint(collateralMintPubkey);

// Create market (3 steps)
const marketId = new BN(12345);
const resolverPubkeys = [resolverPubkey]; // length must match numResolvers
const { marketPda } = await client.createMarket(
  creatorPubkey,
  collateralMintPubkey,
  creatorFeeAccountPubkey,
  {
    marketId,
    outcomeCount: 2,
    resolutionThreshold: 1,
    closeAt: new BN(Math.floor(Date.now() / 1000) + 86400),
    creatorFeeBps: 50,
    depositPlatformFeeBps: 0,
    numResolvers: resolverPubkeys.length,
    title: 'Will it rain?',
    category: 1,
  }
);
await client.initializeMarketResolverSlots(marketPda, { marketId, resolverPubkeys });
await client.initializeMarketMints(marketPda, marketId);

// Trading
await client.mintCompleteSet(user, marketPda, collateralMint, userCollateralAta, platformTreasury, creatorFee, { marketId, amount: new BN(1_000_000) });
await client.redeemCompleteSet(user, marketPda, collateralMint, userCollateralAta, { marketId });

// Resolution
await client.voteResolution(marketPda, { marketId, resolverIndex: 0, outcomeIndex: 0 });
await client.finalizeResolution(marketPda, { marketId });
await client.redeemWinning(user, marketPda, collateralMint, userCollateralAta, { marketId, amount });
```

## PDA helpers

All PDAs are derived in `pda.ts` and re-exported from the SDK:

- `deriveGlobalConfig(programId)`
- `deriveAllowedMint(programId, mint)`
- `deriveMarket(programId, creator, marketId)`
- `deriveVault(programId, market)`
- `deriveOutcomeMint(programId, market, index)`
- `deriveAllOutcomeMints(programId, market)`
- `deriveResolver(programId, market, index)`
- `deriveAllResolvers(programId, market)`
- `deriveResolutionVote(programId, market, resolverIndex)`

## Types

See `src/types.ts` for params and account types (`CreateMarketParams`, `MarketAccount`, etc.).

## Build check

From `app/sdk/`:

```bash
yarn install
yarn typecheck   # npx tsc --noEmit
yarn build       # npx tsc → dist/
yarn example     # run PDA derivation example (no validator needed)
```

Requires `@coral-xyz/anchor`, `@solana/spl-token`, `@solana/web3.js`, and `bn.js` as peer dependencies (provided by the Anchor workspace when used from the same repo).
