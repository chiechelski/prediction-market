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

  const status = market
    ? market.voided
      ? 'voided'
      : market.resolvedOutcomeIndex != null
        ? 'resolved'
        : market.closed
          ? 'closed'
          : 'open'
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
        <p className="text-surface-500">Loading market…</p>
      </div>
    );
  }
  if (error || !market) {
    return (
      <div className="card p-8 text-center">
        <p className="text-surface-600">{error ?? 'Market not found.'}</p>
        <Link to="/markets" className="mt-4 inline-block text-brand-600 hover:text-brand-700">
          ← Back to markets
        </Link>
      </div>
    );
  }

  const outcomeCount = Number(market.outcomeCount);
  return (
    <div>
      <Link
        to="/markets"
        className="mb-6 inline-flex items-center gap-1 text-sm text-surface-600 hover:text-surface-900"
      >
        ← Markets
      </Link>
      <div className="card p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-surface-900">
              Market {marketKey?.slice(0, 8)}…
            </h1>
            <p className="mt-1 text-surface-600">
              {outcomeCount} outcomes · M-of-N: {market.resolutionThreshold}
            </p>
            <p className="mt-1 font-mono text-xs text-surface-500 break-all">
              Collateral: {collateralMint?.toBase58()}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              status === 'open'
                ? 'bg-green-100 text-green-800'
                : status === 'resolved'
                  ? 'bg-brand-100 text-brand-800'
                  : status === 'voided'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-surface-200 text-surface-700'
            }`}
          >
            {status}
          </span>
        </div>

        {!effectiveMarketId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
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
          <p className="text-brand-600 font-medium">
            Resolved: outcome index {market.resolvedOutcomeIndex}
          </p>
        )}

        {txError && (
          <p className="text-sm text-red-600">{txError}</p>
        )}

        {!wallet.publicKey && (
          <p className="text-surface-600">Connect a wallet to transact.</p>
        )}

        {wallet.publicKey && marketIdBn && (
          <>
            <section>
              <h2 className="text-lg font-semibold text-surface-900">
                Trade
              </h2>
              <p className="mt-1 text-sm text-surface-600">
                Mint a complete set (deposit collateral) or redeem one full set.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-surface-500">Amount</label>
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
                  Mint complete set
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleRedeemSet}
                  className="btn-secondary disabled:opacity-50"
                >
                  Redeem 1 full set
                </button>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-surface-900">
                Resolution
              </h2>
              <p className="mt-1 text-sm text-surface-600">
                Resolvers vote, then anyone can finalize when M agree.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-surface-500">Outcome</label>
                  <select
                    value={voteOutcome}
                    onChange={(e) => setVoteOutcome(Number(e.target.value))}
                    className="input"
                  >
                    {Array.from({ length: outcomeCount }, (_, i) => (
                      <option key={i} value={i}>
                        Index {i}
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
                  {resolverSlot !== null ? ` (slot ${resolverSlot})` : ' (not a resolver)'}
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
            </section>

            <section>
              <h2 className="text-lg font-semibold text-surface-900">
                Creator / resolver actions
              </h2>
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
            </section>

            {market.resolvedOutcomeIndex != null && !market.voided && (
              <section>
                <h2 className="text-lg font-semibold text-surface-900">
                  Redeem winning
                </h2>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs text-surface-500">
                      Winning tokens (human)
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
                    Redeem winning
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
