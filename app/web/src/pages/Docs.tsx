export default function Docs() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim px-4 pt-8 pb-12 md:px-6 lg:px-8">
    <div className="mx-auto w-full max-w-7xl">
      <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface italic mb-1">
        SDK &amp; Integration
      </h1>
      <p className="text-outline font-medium">
        Use the TypeScript SDK to create markets, mint sets, resolve outcomes, and redeem from your own app or backend.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-on-surface">Program overview</h2>
        <p className="mt-2 text-on-surface-variant">
          The prediction market program runs on Solana. You create markets with 2–8 outcomes, a collateral mint (e.g. USDC), and M-of-N resolvers.
          Users mint complete sets (pay collateral, receive one token per outcome), then after resolution either redeem winning outcome tokens for collateral or redeem full sets (void/cancel).
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-on-surface-variant">
          <li><strong className="text-on-surface">Create market</strong> — 3 steps: create market + vault, initialize resolvers, initialize outcome mints.</li>
          <li><strong className="text-on-surface">Mint complete set</strong> — User sends collateral; receives one outcome token per outcome (fees deducted).</li>
          <li><strong className="text-on-surface">Redeem complete set</strong> — Burn one of each outcome token; receive collateral back (no fee).</li>
          <li><strong className="text-on-surface">Vote &amp; finalize</strong> — Resolvers vote; when M agree, market resolves. Anyone can call finalize.</li>
          <li><strong className="text-on-surface">Redeem winning</strong> — After resolve, burn winning outcome tokens for collateral.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-on-surface">Web app (this UI)</h2>
        <p className="mt-2 text-on-surface-variant">
          The Vite app under <code className="rounded-md bg-surface-container-highest px-1.5 py-0.5 text-sm text-primary-fixed-dim">app/web</code>{' '}
          uses a browser registry for labels and the numeric <strong>market ID</strong>, and merges in
          on-chain market accounts via RPC for discovery. For routes, instruction mapping, and MVP limits,
          see <code className="rounded-md bg-surface-container-highest px-1.5 py-0.5 text-sm text-primary-fixed-dim">docs/UI-IMPLEMENTATION.md</code>{' '}
          in the repository.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-on-surface">SDK setup</h2>
        <p className="mt-2 text-on-surface-variant">
          The SDK lives in this repo under <code className="rounded-md bg-surface-container-highest px-1.5 py-0.5 text-sm text-primary-fixed-dim">app/sdk</code>. Build the program first so IDL and types exist.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest border border-outline-variant/10 px-4 py-4 text-sm text-on-surface-variant">
{`# From the Anchor workspace root (prediction_market/)
anchor build
cd app/sdk && yarn install && yarn build`}
        </pre>
        <p className="mt-3 text-sm text-on-surface-variant">
          Dependencies: <code className="rounded-md bg-surface-container-highest px-1 py-0.5 text-primary-fixed-dim">@coral-xyz/anchor</code>, <code className="rounded-md bg-surface-container-highest px-1 py-0.5 text-primary-fixed-dim">@solana/web3.js</code>, <code className="rounded-md bg-surface-container-highest px-1 py-0.5 text-primary-fixed-dim">@solana/spl-token</code>, <code className="rounded-md bg-surface-container-highest px-1 py-0.5 text-primary-fixed-dim">bn.js</code>.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-on-surface">Using the client</h2>
        <p className="mt-2 text-on-surface-variant">
          Create a <code className="rounded-md bg-surface-container-highest px-1.5 py-0.5 text-primary-fixed-dim">PredictionMarketClient</code> from your Anchor program instance, then call methods for each instruction.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest border border-outline-variant/10 px-4 py-4 text-sm text-on-surface-variant">
{`import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PredictionMarket } from '../target/types/prediction_market';
import { PredictionMarketClient } from '@prediction-market/sdk';
import { BN } from 'bn.js';

const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>;
const client = new PredictionMarketClient(program);

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
    title: 'Will it rain tomorrow?',
    marketCategory: null,
    marketType: 'completeSet', // omit or 'parimutuel' — pari uses initializeParimutuelState instead of mints
  }
);
// One tx: one program ix per resolver slot
await client.initializeMarketResolverSlots(marketPda, { marketId, resolverPubkeys });
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
        <h2 className="text-xl font-semibold text-on-surface">PDA helpers</h2>
        <p className="mt-2 text-on-surface-variant">
          The SDK exports PDA derivation functions so you don't have to pass every account manually.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-on-surface-variant">
          {[
            'deriveGlobalConfig(programId)',
            'deriveAllowedMint(programId, mint)',
            'deriveMarket(programId, creator, marketId)',
            'deriveVault(programId, market)',
            'deriveOutcomeMint(programId, market, index)',
            'deriveAllOutcomeMints(programId, market)',
            'deriveResolver(programId, market, index)',
            'deriveResolutionVote(programId, market, resolverIndex)',
          ].map((fn) => (
            <li key={fn}>
              <code className="rounded-md bg-surface-container-highest px-1.5 py-0.5 text-primary-fixed-dim">{fn}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-on-surface">Program ID</h2>
        <p className="mt-2 font-mono text-sm text-primary break-all">
          C5QvWnGHeC6o7N68heWFKPvC35eggZ9Mrgqzj86WwrBv
        </p>
        <p className="mt-2 text-sm text-outline">
          Use devnet or mainnet depending on where the program is deployed. This app uses the RPC endpoint from{' '}
          <code className="rounded-md bg-surface-container-highest px-1 py-0.5 text-primary-fixed-dim">VITE_RPC_ENDPOINT</code> (default: devnet).
        </p>
      </section>

      <section className="mt-10 rounded-2xl bg-surface-container border border-outline-variant/10 p-6">
        <h2 className="text-lg font-semibold text-on-surface">Full SDK README</h2>
        <p className="mt-1 text-on-surface-variant">
          For types, build scripts, and more examples, see the SDK package README in the repo:{' '}
          <code className="rounded-md bg-surface-container-highest px-1 py-0.5 text-primary-fixed-dim">app/sdk/README.md</code>.
        </p>
      </section>
    </div>
    </div>
  );
}
