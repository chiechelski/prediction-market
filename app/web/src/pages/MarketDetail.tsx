import { useParams, Link } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useState, useEffect, useCallback } from 'react';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { fetchIdl } from '@/lib/program';
import { getRegisteredMarket } from '@/lib/marketRegistry';
import {
  mintCompleteSetTx,
  redeemCompleteSetTx,
  voteResolutionTx,
  finalizeResolutionTx,
  closeMarketEarlyTx,
  voidMarketTx,
  redeemWinningTx,
  findResolverSlot,
} from '@/lib/marketActions';

/** Slash-separated labels from create flow, e.g. "Yes / No / Draw". */
function outcomeLabelsFromRegistry(
  label: string | undefined,
  outcomeCount: number
): string[] {
  const parts = label
    ?.split(' / ')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
  if (parts.length === outcomeCount && outcomeCount > 0) return parts;
  return Array.from({ length: outcomeCount }, (_, i) => `Outcome ${i + 1}`);
}

export default function MarketDetail() {
  const { marketKey } = useParams<{ marketKey: string }>();
  const { connection } = useConnection();
  const wallet = useWallet();
  const [market, setMarket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [manualMarketId, setManualMarketId] = useState('');
  const [mintHuman, setMintHuman] = useState('1');
  const [winHuman, setWinHuman] = useState('');
  const [voteOutcome, setVoteOutcome] = useState(0);
  const [resolverSlot, setResolverSlot] = useState<number | null>(null);
  const [resolvedCategoryName, setResolvedCategoryName] = useState<
    string | null
  >(null);

  const registry = marketKey ? getRegisteredMarket(marketKey) : undefined;
  const effectiveMarketId =
    registry?.marketId ?? (manualMarketId.trim() || null);

  const loadMarket = useCallback(async () => {
    if (!marketKey) return;
    setLoading(true);
    setError(null);
    try {
      const idl = await fetchIdl();
      const dummy = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: async (t: any) => t,
        signAllTransactions: async (ts: any) => ts,
      };
      const provider = new AnchorProvider(connection, dummy as any, {
        commitment: 'confirmed',
      });
      const program = new Program(idl, provider);
      const account = await (program.account as any).market.fetch(
        new PublicKey(marketKey)
      );
      setMarket(account);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load market');
      setMarket(null);
    } finally {
      setLoading(false);
    }
  }, [connection, marketKey]);

  useEffect(() => {
    loadMarket();
  }, [loadMarket]);

  useEffect(() => {
    if (!market?.category) {
      setResolvedCategoryName(null);
      return;
    }
    const catPk = market.category as PublicKey;
    if (catPk.equals(PublicKey.default)) {
      setResolvedCategoryName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const idl = await fetchIdl();
        const dummy = {
          publicKey: new PublicKey('11111111111111111111111111111111'),
          signTransaction: async (t: unknown) => t,
          signAllTransactions: async (ts: unknown) => ts,
        };
        const provider = new AnchorProvider(connection, dummy as any, {
          commitment: 'confirmed',
        });
        const program = new Program(idl, provider);
        const acc = await (program.account as any).marketCategory.fetch(catPk);
        if (!cancelled) setResolvedCategoryName(String(acc.name ?? ''));
      } catch {
        if (!cancelled) setResolvedCategoryName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, market]);

  useEffect(() => {
    if (!marketKey || !wallet.publicKey || !market) {
      setResolverSlot(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const slot = await findResolverSlot(
        connection,
        wallet,
        new PublicKey(marketKey)
      );
      if (!cancelled) setResolverSlot(slot);
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, marketKey, wallet.publicKey, wallet, market]);

  const marketIdBn = effectiveMarketId
    ? new BN(effectiveMarketId, 10)
    : null;

  const status: 'voided' | 'resolved' | 'closed' | 'open' | 'closing-soon' | 'unknown' =
    market
      ? market.voided
        ? 'voided'
        : market.resolvedOutcomeIndex != null
          ? 'resolved'
          : market.closed
            ? 'closed'
            : (() => {
                const closeAt = Number(market.closeAt);
                const now = Date.now() / 1000;
                const left = closeAt - now;
                if (left > 0 && left < 86400 * 2) return 'closing-soon';
                return 'open';
              })()
      : 'unknown';

  const collateralMint: PublicKey | null = market
    ? (market.collateralMint as PublicKey)
    : null;

  const run = async (fn: () => Promise<void>) => {
    setTxError(null);
    setBusy(true);
    try {
      await fn();
      await loadMarket();
    } catch (e: any) {
      setTxError(e?.message ?? 'Transaction failed');
    } finally {
      setBusy(false);
    }
  };

  const handleMint = async () => {
    if (!marketKey || !wallet.publicKey || !marketIdBn || !collateralMint) return;
    const dec = Number(market.collateralDecimals);
    const n = parseFloat(mintHuman);
    if (!Number.isFinite(n) || n <= 0) {
      setTxError('Enter a positive amount');
      return;
    }
    const raw = new BN(Math.floor(n * 10 ** dec));
    await run(() =>
      mintCompleteSetTx(
        connection,
        wallet,
        new PublicKey(marketKey),
        marketIdBn,
        collateralMint,
        raw
      )
    );
  };

  const handleRedeemSet = async () => {
    if (!marketKey || !marketIdBn || !collateralMint) return;
    await run(() =>
      redeemCompleteSetTx(
        connection,
        wallet,
        new PublicKey(marketKey),
        marketIdBn,
        collateralMint
      )
    );
  };

  const handleVote = async () => {
    if (
      !marketKey ||
      !marketIdBn ||
      resolverSlot === null ||
      resolverSlot === undefined
    ) {
      setTxError('Your wallet is not a resolver for this market');
      return;
    }
    await run(() =>
      voteResolutionTx(
        connection,
        wallet,
        new PublicKey(marketKey),
        marketIdBn,
        voteOutcome,
        resolverSlot
      )
    );
  };

  const handleFinalize = async () => {
    if (!marketKey || !marketIdBn) return;
    await run(() =>
      finalizeResolutionTx(
        connection,
        wallet,
        new PublicKey(marketKey),
        marketIdBn
      )
    );
  };

  const handleCloseEarly = async () => {
    if (!marketKey || !marketIdBn) return;
    await run(() =>
      closeMarketEarlyTx(
        connection,
        wallet,
        new PublicKey(marketKey),
        marketIdBn
      )
    );
  };

  const handleVoid = async () => {
    if (!marketKey || !marketIdBn) return;
    await run(() =>
      voidMarketTx(connection, wallet, new PublicKey(marketKey), marketIdBn)
    );
  };

  const handleRedeemWinning = async () => {
    if (!marketKey || !marketIdBn || !collateralMint || !market) return;
    const dec = Number(market.collateralDecimals);
    const n = parseFloat(winHuman);
    if (!Number.isFinite(n) || n <= 0) {
      setTxError('Enter winning amount to redeem');
      return;
    }
    const raw = new BN(Math.floor(n * 10 ** dec));
    const winIdx = market.resolvedOutcomeIndex;
    if (winIdx === null || winIdx === undefined) {
      setTxError('Market not resolved');
      return;
    }
    await run(() =>
      redeemWinningTx(
        connection,
        wallet,
        new PublicKey(marketKey),
        marketIdBn,
        collateralMint,
        raw
      )
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-outline">Loading market…</p>
      </div>
    );
  }
  if (error || !market) {
    return (
      <div className="card p-8 text-center">
        <p className="text-on-surface-variant">{error ?? 'Market not found.'}</p>
        <Link to="/markets" className="mt-4 inline-block text-brand-600 hover:text-brand-700">
          ← Back to markets
        </Link>
      </div>
    );
  }

  const outcomeCount = Number(market.outcomeCount);
  const chainTitle =
    typeof market.title === 'string' ? market.title.trim() : '';
  const chainCategoryLabel = resolvedCategoryName?.trim() ?? '';
  const displayTitle =
    chainTitle ||
    registry?.title?.trim() ||
    `Market ${marketKey?.slice(0, 8)}…`;
  const displayCategory = chainCategoryLabel || registry?.category;
  const outcomeLabels = outcomeLabelsFromRegistry(registry?.label, outcomeCount);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim px-4 pt-8 pb-12 md:px-6 lg:px-8">
    <div className="mx-auto w-full max-w-7xl">
      <Link
        to="/markets"
        className="mb-6 inline-flex items-center gap-1 text-sm text-outline hover:text-on-surface transition-colors"
      >
        ← Markets
      </Link>
      <div className="card p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface italic">
              {displayTitle}
            </h1>
            {displayCategory && (
              <p className="mt-1">
                <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                  {displayCategory}
                </span>
              </p>
            )}
            <p className="mt-1 text-on-surface-variant">
              {outcomeCount} outcomes · M-of-N: {market.resolutionThreshold}
            </p>
            <details className="mt-2 text-xs text-outline">
              <summary className="cursor-pointer select-none text-outline hover:text-on-surface-variant">
                Collateral mint (technical)
              </summary>
              <p className="mt-1 font-mono break-all pl-1">
                {collateralMint?.toBase58()}
              </p>
            </details>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${
              status === 'open'
                ? 'bg-secondary/10 text-secondary'
                : status === 'resolved'
                  ? 'bg-primary/10 text-primary'
                  : status === 'voided'
                    ? 'bg-error/10 text-error'
                    : status === 'closing-soon'
                      ? 'bg-tertiary/10 text-tertiary'
                      : 'text-outline'
            }`}
          >
            {status}
          </span>
        </div>

        {!effectiveMarketId && (
          <div className="rounded-xl border border-tertiary/20 bg-tertiary/10 p-4">
            <p className="text-sm text-tertiary">
              This browser has no stored <code>marketId</code> for this market.
              Enter the u64 market id used at creation (same device saves it
              automatically).
            </p>
            <input
              type="text"
              value={manualMarketId}
              onChange={(e) => setManualMarketId(e.target.value)}
              placeholder="market id (decimal)"
              className="input mt-2 font-mono"
            />
          </div>
        )}

        {market.resolvedOutcomeIndex != null && (
          <p className="text-primary font-medium">
            Resolved: outcome index {market.resolvedOutcomeIndex}
          </p>
        )}

        {txError && (
          <div className="flex items-start gap-2 rounded-xl bg-error/10 border border-error/20 p-3">
            <span className="material-symbols-outlined text-error text-[16px] mt-0.5">error</span>
            <p className="text-sm text-error">{txError}</p>
          </div>
        )}

        {!wallet.publicKey && (
          <p className="text-on-surface-variant">Connect a wallet to transact.</p>
        )}

        {wallet.publicKey && marketIdBn && (
          <>
            <section className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest/80 p-4">
              <h2 className="text-lg font-bold text-on-surface">
                Participate
              </h2>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                This market uses <strong className="text-on-surface">one token per outcome</strong>{' '}
                (e.g. {outcomeLabels.slice(0, 3).join(', ')}
                {outcomeCount > 3 ? '…' : ''}).{' '}
                <strong className="text-on-surface">Deposit</strong> collateral to receive{' '}
                <em>all</em> of those tokens at once—not a single “pick.” To lean toward one outcome
                you’d trade tokens elsewhere (this app doesn’t include a swap).
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-on-surface-variant">
                <li>
                  <strong className="text-on-surface">Deposit</strong> — pay collateral, get 1 unit of
                  every outcome token (protocol term: “mint complete set”).
                </li>
                <li>
                  <strong className="text-on-surface">Withdraw full set</strong> — burn 1 of each
                  outcome token, get your collateral back (protocol: “redeem complete set”).
                </li>
              </ul>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-outline">Amount (collateral)</label>
                  <input
                    type="text"
                    value={mintHuman}
                    onChange={(e) => setMintHuman(e.target.value)}
                    className="input w-32"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy || status !== 'open'}
                  onClick={handleMint}
                  className="btn-primary disabled:opacity-50"
                >
                  Deposit &amp; get all outcome tokens
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleRedeemSet}
                  className="btn-secondary disabled:opacity-50"
                >
                  Withdraw (return full set)
                </button>
              </div>
            </section>

            {market.resolvedOutcomeIndex != null && !market.voided && (
              <section>
                <h2 className="text-lg font-bold text-on-surface">
                  Claim payout
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  After resolution, redeem winning outcome tokens for collateral.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs text-outline">
                      Amount (winning tokens)
                    </label>
                    <input
                      type="text"
                      value={winHuman}
                      onChange={(e) => setWinHuman(e.target.value)}
                      className="input w-32"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRedeemWinning}
                    className="btn-primary disabled:opacity-50"
                  >
                    Redeem for collateral
                  </button>
                </div>
              </section>
            )}

            <details className="group rounded-xl border border-outline-variant/10 bg-surface-container-lowest/40 p-4">
              <summary className="cursor-pointer list-none font-bold text-on-surface marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-outline transition-transform group-open:rotate-90">
                    chevron_right
                  </span>
                  Resolvers &amp; resolution
                </span>
              </summary>
              <p className="mt-2 text-sm text-on-surface-variant">
                Assigned wallets vote on the winning outcome; when enough agree, anyone can finalize.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-outline">Vote for</label>
                  <select
                    value={voteOutcome}
                    onChange={(e) => setVoteOutcome(Number(e.target.value))}
                    className="input min-w-[12rem]"
                  >
                    {Array.from({ length: outcomeCount }, (_, i) => (
                      <option key={i} value={i}>
                        {outcomeLabels[i]}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={
                    busy ||
                    resolverSlot === null ||
                    market.voided ||
                    market.resolvedOutcomeIndex != null
                  }
                  onClick={handleVote}
                  className="btn-primary disabled:opacity-50"
                >
                  Submit vote
                  {resolverSlot !== null ? ` (resolver ${resolverSlot})` : ' (not a resolver)'}
                </button>
                <button
                  type="button"
                  disabled={busy || market.resolvedOutcomeIndex != null}
                  onClick={handleFinalize}
                  className="btn-secondary disabled:opacity-50"
                >
                  Finalize resolution
                </button>
              </div>
            </details>

            <details className="group rounded-xl border border-outline-variant/10 bg-surface-container-lowest/40 p-4">
              <summary className="cursor-pointer list-none font-bold text-on-surface marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-outline transition-transform group-open:rotate-90">
                    chevron_right
                  </span>
                  Creator &amp; admin
                </span>
              </summary>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCloseEarly}
                  className="btn-secondary disabled:opacity-50"
                >
                  Close market early
                </button>
                <button
                  type="button"
                  disabled={
                    busy ||
                    market.resolvedOutcomeIndex != null ||
                    market.voided
                  }
                  onClick={handleVoid}
                  className="btn-secondary disabled:opacity-50"
                >
                  Void market
                </button>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
    </div>
  );
}
