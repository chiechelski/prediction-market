export default function Docs() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-semibold text-surface-900">
        SDK &amp; integration
      </h1>
      <p className="mt-2 text-surface-600">
        Use the TypeScript SDK to create markets, mint sets, resolve outcomes, and redeem from your own app or backend.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-surface-900">Program overview</h2>
        <p className="mt-2 text-surface-600">
          The prediction market program runs on Solana. You create markets with 2–8 outcomes, a collateral mint (e.g. USDC), and M-of-N resolvers.
          Users mint complete sets (pay collateral, receive one token per outcome), then after resolution either redeem winning outcome tokens for collateral or redeem full sets (void/cancel).
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-surface-600">
          <li><strong>Create market</strong> — 3 steps: create market + vault, initialize resolvers, initialize outcome mints.</li>
          <li><strong>Mint complete set</strong> — User sends collateral; receives one outcome token per outcome (fees deducted).</li>
          <li><strong>Redeem complete set</strong> — Burn one of each outcome token; receive collateral back (no fee).</li>
          <li><strong>Vote &amp; finalize</strong> — Resolvers vote; when M agree, market resolves. Anyone can call finalize.</li>
          <li><strong>Redeem winning</strong> — After resolve, burn winning outcome tokens for collateral.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-surface-900">Web app (this UI)</h2>
        <p className="mt-2 text-surface-600">
          The Vite app under <code className="rounded bg-surface-100 px-1.5 py-0.5 text-sm">app/web</code>{' '}
          uses a browser registry for labels and the numeric <strong>market ID</strong>, and merges in
          on-chain market accounts via RPC for discovery. For routes, instruction mapping, and MVP limits,
          see <code className="rounded bg-surface-100 px-1.5 py-0.5 text-sm">docs/UI-IMPLEMENTATION.md</code>{' '}
          in the repository.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-surface-900">SDK setup</h2>
        <p className="mt-2 text-surface-600">
          The SDK lives in this repo under <code className="rounded bg-surface-100 px-1.5 py-0.5 text-sm">app/sdk</code>. Build the program first so IDL and types exist.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-surface-200 bg-surface-900 px-4 py-4 text-sm text-surface-100">
{`# From the Anchor workspace root (prediction_market/)
anchor build
cd app/sdk && yarn install && yarn build`}
        </pre>
        <p className="mt-3 text-sm text-surface-600">
          Dependencies: <code className="rounded bg-surface-100 px-1 py-0.5">@coral-xyz/anchor</code>, <code className="rounded bg-surface-100 px-1 py-0.5">@solana/web3.js</code>, <code className="rounded bg-surface-100 px-1 py-0.5">@solana/spl-token</code>, <code className="rounded bg-surface-100 px-1 py-0.5">bn.js</code>.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-surface-900">Using the client</h2>
        <p className="mt-2 text-surface-600">
          Create a <code className="rounded bg-surface-100 px-1.5 py-0.5">PredictionMarketClient</code> from your Anchor program instance, then call methods for each instruction.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-surface-200 bg-surface-900 px-4 py-4 text-sm text-surface-100">
{`import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PredictionMarket } from '../target/types/prediction_market';
import { PredictionMarketClient } from '@prediction-market/sdk';
import { BN } from 'bn.js';

const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>;
const client = new PredictionMarketClient(program);

// Create market (3 steps)
const { marketPda } = await client.createMarket(
  creatorPubkey,
  collateralMintPubkey,
  creatorFeeAccountPubkey,
  {
    marketId: new BN(12345),
    outcomeCount: 2,
    resolutionThreshold: 1,
    closeAt: new BN(Math.floor(Date.now() / 1000) + 86400),
    creatorFeeBps: 50,
    platformFeeBps: 0,
    numResolvers: 1,
  }
);
await client.initializeMarketResolvers(marketPda, { marketId, resolverPubkeys, numResolvers });
await client.initializeMarketMints(marketPda, marketId);

// Mint a complete set
await client.mintCompleteSet(
  userPubkey, marketPda, collateralMint,
  userCollateralAta, platformTreasury, creatorFeeAta,
  { marketId, amount: new BN(1_000_000) }
);

// Resolve (resolver signs)
await client.voteResolution(marketPda, { marketId, resolverIndex: 0, outcomeIndex: 0 });
await client.finalizeResolution(marketPda, { marketId });

// Redeem winning tokens
await client.redeemWinning(userPubkey, marketPda, collateralMint, userCollateralAta, { marketId, amount });`}
        </pre>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-surface-900">PDA helpers</h2>
        <p className="mt-2 text-surface-600">
          The SDK exports PDA derivation functions so you don’t have to pass every account manually.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-surface-600">
          <li><code className="rounded bg-surface-100 px-1 py-0.5">deriveGlobalConfig(programId)</code></li>
          <li><code className="rounded bg-surface-100 px-1 py-0.5">deriveAllowedMint(programId, mint)</code></li>
          <li><code className="rounded bg-surface-100 px-1 py-0.5">deriveMarket(programId, creator, marketId)</code></li>
          <li><code className="rounded bg-surface-100 px-1 py-0.5">deriveVault(programId, market)</code></li>
          <li><code className="rounded bg-surface-100 px-1 py-0.5">deriveOutcomeMint(programId, market, index)</code></li>
          <li><code className="rounded bg-surface-100 px-1 py-0.5">deriveAllOutcomeMints(programId, market)</code></li>
          <li><code className="rounded bg-surface-100 px-1 py-0.5">deriveResolver(programId, market, index)</code></li>
          <li><code className="rounded bg-surface-100 px-1 py-0.5">deriveResolutionVote(programId, market, resolverIndex)</code></li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-surface-900">Program ID</h2>
        <p className="mt-2 font-mono text-sm text-surface-600 break-all">
          C5QvWnGHeC6o7N68heWFKPvC35eggZ9Mrgqzj86WwrBv
        </p>
        <p className="mt-2 text-sm text-surface-500">
          Use devnet or mainnet depending on where the program is deployed. This app uses the RPC endpoint from <code className="rounded bg-surface-100 px-1 py-0.5">VITE_RPC_ENDPOINT</code> (default: devnet).
        </p>
      </section>

      <section className="mt-10 rounded-xl border border-surface-200 bg-surface-50 p-6">
        <h2 className="text-lg font-semibold text-surface-900">Full SDK README</h2>
        <p className="mt-1 text-surface-600">
          For types, build scripts, and more examples, see the SDK package README in the repo: <code className="rounded bg-surface-100 px-1 py-0.5">app/sdk/README.md</code>.
        </p>
      </section>
    </div>
  );
}
