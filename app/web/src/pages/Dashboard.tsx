import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  listRegisteredMarkets,
  REGISTRY_CHANGED_EVENT,
  REGISTRY_STORAGE_KEY,
  type RegisteredMarket,
} from '@/lib/marketRegistry';
import {
  fetchAllMarketsFromChain,
  mergeRegistryAndChain,
  type ChainMarketRow,
  type DashboardMarketEntry,
} from '@/lib/marketDiscovery';
import { findResolverSlot } from '@/lib/marketActions';

type Tab = 'markets' | 'creator' | 'judges';

export default function Dashboard({
  tab,
}: {
  tab: Tab;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [all, setAll] = useState<RegisteredMarket[]>([]);
  const [chainRows, setChainRows] = useState<ChainMarketRow[] | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [judgeList, setJudgeList] = useState<DashboardMarketEntry[] | null>(
    null
  );
  const [judgesLoading, setJudgesLoading] = useState(false);

  const refreshRegistry = () => setAll(listRegisteredMarkets());

  useEffect(() => {
    refreshRegistry();
    const onStorage = (e: StorageEvent) => {
      if (e.key === REGISTRY_STORAGE_KEY) refreshRegistry();
    };
    window.addEventListener(REGISTRY_CHANGED_EVENT, refreshRegistry);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(REGISTRY_CHANGED_EVENT, refreshRegistry);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setChainLoading(true);
    setChainError(null);
    fetchAllMarketsFromChain(connection)
      .then((rows) => {
        if (!cancelled) setChainRows(rows);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setChainError(e?.message ?? 'Failed to load markets from chain');
          setChainRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setChainLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const mergedMarkets = useMemo(
    () => mergeRegistryAndChain(all, chainRows ?? []),
    [all, chainRows]
  );

  useEffect(() => {
    if (tab !== 'judges' || !wallet.publicKey || chainRows === null) {
      setJudgeList(null);
      return;
    }
    let cancelled = false;
    setJudgesLoading(true);
    (async () => {
      const matches: DashboardMarketEntry[] = [];
      for (const row of chainRows) {
        const slot = await findResolverSlot(
          connection,
          wallet,
          row.marketPda
        );
        if (slot === null) continue;
        const reg = all.find(
          (m) => m.marketPda === row.marketPda.toBase58()
        );
        matches.push({
          marketPda: row.marketPda.toBase58(),
          creator: row.creator,
          marketId: reg?.marketId ?? null,
          label: reg?.label ?? `On-chain ${row.marketPda.toBase58().slice(0, 4)}…`,
          createdAt: reg?.createdAt ?? 0,
          outcomeCount: row.outcomeCount,
        });
      }
      matches.sort(
        (a, b) =>
          b.createdAt - a.createdAt || a.marketPda.localeCompare(b.marketPda)
      );
      if (!cancelled) {
        setJudgeList(matches);
        setJudgesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, connection, wallet, wallet.publicKey, chainRows, all]);

  const tabs: { id: Tab; label: string; to: string }[] = [
    { id: 'markets', label: 'All markets', to: '/markets' },
    { id: 'creator', label: 'My markets (creator)', to: '/creator' },
    { id: 'judges', label: 'My markets (judge)', to: '/judges' },
  ];

  const creatorMarkets =
    wallet.publicKey != null
      ? mergedMarkets.filter(
          (m) => m.creator === wallet.publicKey!.toBase58()
        )
      : [];

  const displayList: DashboardMarketEntry[] =
    tab === 'markets'
      ? mergedMarkets
      : tab === 'creator'
        ? creatorMarkets
        : judgeList ?? [];

  const listLoading = tab === 'judges' ? judgesLoading : chainLoading;

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-surface-900">
          {tab === 'markets' && 'Markets'}
          {tab === 'creator' && 'Markets you created'}
          {tab === 'judges' && 'Markets you resolve'}
        </h1>
        <p className="mt-1 text-surface-600">
          {tab === 'markets' &&
            'Merged view: this browser’s saved markets plus any market accounts on-chain (RPC).'}
          {tab === 'creator' &&
            'Your wallet as creator — includes on-chain markets even if not saved locally.'}
          {tab === 'judges' &&
            'Every on-chain market where your wallet is a resolver (no local save required).'}
        </p>
      </div>

      <div className="mb-6 flex gap-1 rounded-lg border border-surface-200 bg-white p-1">
        {tabs.map((t) => (
          <Link
            key={t.id}
            to={t.to}
            className={`flex-1 rounded-md px-4 py-2.5 text-center text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-surface-100 text-surface-900'
                : 'text-surface-600 hover:text-surface-900'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {chainError && tab !== 'judges' && (
        <p className="text-sm text-amber-700 mb-4">
          Chain discovery: {chainError} (saved markets below may still load.)
        </p>
      )}

      {listLoading && (
        <p className="text-surface-500 text-sm mb-4">
          {tab === 'judges' ? 'Loading judge markets…' : 'Loading on-chain markets…'}
        </p>
      )}

      {displayList.length === 0 && !listLoading ? (
        <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50/50 p-12 text-center">
          <p className="text-surface-600">
            {tab === 'markets' &&
              'No markets found on-chain or in this browser. Create one to save it locally.'}
            {tab === 'creator' &&
              'No markets with this wallet as creator (check RPC / devnet).'}
            {tab === 'judges' &&
              'No on-chain markets where this wallet is a resolver.'}
          </p>
          {tab === 'markets' && (
            <Link
              to="/create"
              className="mt-4 inline-block text-brand-600 font-medium hover:text-brand-700"
            >
              Create your first market →
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {displayList.map((m) => (
            <li key={m.marketPda}>
              <Link
                to={`/market/${m.marketPda}`}
                className="card block p-4 hover:border-brand-300 transition-colors"
              >
                <div className="font-medium text-surface-900">{m.label}</div>
                {m.marketId === null && (
                  <p className="mt-1 text-xs text-amber-700">
                    Market ID not in this browser — open the page and enter the
                    numeric ID to transact.
                  </p>
                )}
                <div className="mt-1 font-mono text-xs text-surface-500 break-all">
                  {m.marketPda}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
