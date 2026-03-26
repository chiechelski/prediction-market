import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { createMarketFullFlow } from '@/lib/marketActions';
import { registerMarket } from '@/lib/marketRegistry';

function parseExtraPubkeys(text: string): PublicKey[] {
  const parts = text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: PublicKey[] = [];
  for (const p of parts) {
    try {
      out.push(new PublicKey(p));
    } catch {
      throw new Error(`Invalid pubkey: ${p}`);
    }
  }
  return out;
}

export default function CreateMarket() {
  const navigate = useNavigate();
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomeCount, setOutcomeCount] = useState(2);
  const [outcomeLabels, setOutcomeLabels] = useState<string[]>(['Yes', 'No']);
  const [resolutionThreshold, setResolutionThreshold] = useState(1);
  const [closeAtDays, setCloseAtDays] = useState(7);
  const [creatorFeeBps, setCreatorFeeBps] = useState(50);
  const [collateralMintStr, setCollateralMintStr] = useState(
    import.meta.env.VITE_COLLATERAL_MINT ?? ''
  );
  const [extraResolvers, setExtraResolvers] = useState('');

  const updateOutcomeLabels = (n: number) => {
    setOutcomeCount(n);
    const next = outcomeLabels.slice(0, n);
    while (next.length < n) next.push(`Outcome ${next.length + 1}`);
    setOutcomeLabels(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey) {
      setError('Connect your wallet');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const mintStr =
        collateralMintStr.trim() ||
        import.meta.env.VITE_COLLATERAL_MINT ||
        'So11111111111111111111111111111111111111112';
      const collateralMint = new PublicKey(mintStr);

      const extras = parseExtraPubkeys(extraResolvers);
      const resolverPubkeys = [wallet.publicKey, ...extras].slice(0, 8);
      const numResolvers = resolverPubkeys.length;

      if (resolutionThreshold > numResolvers) {
        throw new Error('Resolution threshold cannot exceed number of resolvers');
      }

      const marketId = new BN(Math.floor(Math.random() * 1_000_000_000));
      const closeAt = new BN(
        Math.floor(Date.now() / 1000) + closeAtDays * 86400
      );

      const label =
        outcomeLabels.slice(0, outcomeCount).join(' / ') || 'Market';

      const { marketPda } = await createMarketFullFlow(connection, wallet, {
        marketId,
        outcomeCount,
        resolutionThreshold,
        closeAt,
        creatorFeeBps,
        platformFeeBps: 0,
        collateralMint,
        resolverPubkeys,
      });

      registerMarket({
        marketPda: marketPda.toBase58(),
        creator: wallet.publicKey.toBase58(),
        marketId: marketId.toString(),
        label,
      });

      navigate(`/market/${marketPda.toBase58()}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  if (!wallet.publicKey) {
    return (
      <div className="card p-8 text-center">
        <p className="text-on-surface-variant">Connect your wallet to create a market.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim px-4 pt-8 pb-12 md:px-6 lg:px-8">
    <div className="mx-auto w-full max-w-7xl">
      <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface italic mb-1">
        Create market
      </h1>
      <p className="text-outline font-medium">
        Creates the market account, resolver accounts, and outcome mints (three
        transactions).
      </p>

      <form onSubmit={handleSubmit} className="mt-8 max-w-3xl space-y-6">
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Collateral mint
          </label>
          <input
            type="text"
            value={collateralMintStr}
            onChange={(e) => setCollateralMintStr(e.target.value)}
            placeholder="Pubkey (must be on platform allowlist)"
            className="input mt-1 font-mono text-sm"
          />
          <p className="mt-1 text-xs text-outline">
            Defaults to VITE_COLLATERAL_MINT or wrapped SOL if empty.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Number of outcomes (2–8)
          </label>
          <input
            type="number"
            min={2}
            max={8}
            value={outcomeCount}
            onChange={(e) => updateOutcomeLabels(Number(e.target.value))}
            className="input mt-1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Outcome labels
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {outcomeLabels.map((label, i) => (
              <input
                key={i}
                type="text"
                value={label}
                onChange={(e) => {
                  const next = [...outcomeLabels];
                  next[i] = e.target.value;
                  setOutcomeLabels(next);
                }}
                className="input w-32"
                placeholder={`Outcome ${i + 1}`}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Additional resolver pubkeys
          </label>
          <textarea
            value={extraResolvers}
            onChange={(e) => setExtraResolvers(e.target.value)}
            placeholder="Comma or newline separated. Your wallet is always resolver #0."
            className="input mt-1 min-h-[80px] font-mono text-sm"
            rows={3}
          />
          <p className="mt-1 text-xs text-outline">
            Resolvers: your wallet first, then these (max 8 total).
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Resolution threshold (M-of-N)
          </label>
          <input
            type="number"
            min={1}
            max={8}
            value={resolutionThreshold}
            onChange={(e) => setResolutionThreshold(Number(e.target.value))}
            className="input mt-1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Close after (days)
          </label>
          <input
            type="number"
            min={1}
            value={closeAtDays}
            onChange={(e) => setCloseAtDays(Number(e.target.value))}
            className="input mt-1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Creator fee (basis points, 0–10000)
          </label>
          <input
            type="number"
            min={0}
            max={10000}
            value={creatorFeeBps}
            onChange={(e) => setCreatorFeeBps(Number(e.target.value))}
            className="input mt-1"
          />
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-error/10 border border-error/20 p-3">
            <span className="material-symbols-outlined text-error text-[16px] mt-0.5">error</span>
            <p className="text-sm text-error">{error}</p>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create market'}
        </button>
      </form>
    </div>
    </div>
  );
}
