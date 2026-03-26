import { useState, useEffect, useMemo, useRef } from 'react';
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
  getMarketStatus,
  formatTimeLeft,
  type ChainMarketRow,
  type DashboardMarketEntry,
  type MarketStatus,
} from '@/lib/marketDiscovery';
import { findResolverSlot } from '@/lib/marketActions';

type Tab = 'markets' | 'creator' | 'judges';
type StatusFilter = 'all' | 'open' | 'closing-soon' | 'closed' | 'resolved' | 'voided';

// Parse "Yes / No / Maybe" label → ["Yes", "No", "Maybe"]
function parseOutcomeLabels(label: string, count: number): string[] {
  const parts = label.split(' / ').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 8) return parts.slice(0, count);
  return Array.from({ length: count }, (_, i) => `Outcome ${i + 1}`);
}

function shortPk(pk: string) {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: MarketStatus }) {
  if (status === 'open') {
    return (
      <span className="flex items-center gap-1.5 text-secondary text-[10px] font-black uppercase tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
        Open
      </span>
    );
  }
  if (status === 'closing-soon') {
    return (
      <span className="flex items-center gap-1.5 text-tertiary text-[10px] font-black uppercase tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
        Closing Soon
      </span>
    );
  }
  if (status === 'resolved') {
    return (
      <span className="flex items-center gap-1.5 text-outline text-[10px] font-black uppercase tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-outline" />
        Resolved
      </span>
    );
  }
  if (status === 'voided') {
    return (
      <span className="flex items-center gap-1.5 text-error text-[10px] font-black uppercase tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-error" />
        Voided
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-outline text-[10px] font-black uppercase tracking-widest">
      <span className="w-1.5 h-1.5 rounded-full bg-outline" />
      Closed
    </span>
  );
}

// ── Market Card ───────────────────────────────────────────────────────────────
function MarketCard({ m }: { m: DashboardMarketEntry }) {
  const status = getMarketStatus(m);
  const outcomes = parseOutcomeLabels(m.label, m.outcomeCount ?? 2);
  const winIdx = m.resolvedOutcomeIndex ?? null;
  const isResolved = status === 'resolved';
  const isActive = status === 'open' || status === 'closing-soon';

  const cardBg =
    isResolved || status === 'voided' || status === 'closed'
      ? 'bg-surface-container/50 grayscale-[0.2]'
      : 'bg-surface-container hover:bg-surface-container-low';

  return (
    <Link
      to={`/market/${m.marketPda}`}
      className={`group ${cardBg} border border-outline-variant/5 rounded-2xl p-6 flex flex-col transition-all duration-300 relative overflow-hidden`}
    >
      {/* Ambient glow for active markets */}
      {isActive && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 blur-[40px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      )}

      {/* Header row */}
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="flex flex-col gap-1">
          <StatusChip status={status} />
          {m.closeAt && isActive && (
            <span className="text-outline text-[10px] uppercase font-bold tracking-tighter">
              Ends in {formatTimeLeft(m.closeAt)}
            </span>
          )}
          {isResolved && (
            <span className="text-outline text-[10px] uppercase font-bold tracking-tighter">
              Resolved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 bg-surface-container-lowest px-2 py-1 rounded-md shrink-0">
          <span className="material-symbols-outlined text-[14px] text-primary">
            {m.resolutionThreshold ? 'how_to_vote' : 'groups'}
          </span>
          <span className="text-[10px] font-bold text-on-surface">
            {m.resolutionThreshold
              ? `${m.resolutionThreshold}-of-N`
              : `${m.outcomeCount ?? '?'} outcomes`}
          </span>
        </div>
      </div>

      {/* Market title */}
      <h3
        className={`font-headline text-xl font-bold leading-snug mb-6 flex-1 relative z-10 ${
          isResolved || status === 'voided' ? 'text-on-surface/60' : 'text-on-surface'
        }`}
      >
        {m.label}
      </h3>

      {/* Outcome buttons */}
      <div className="relative z-10 mb-6">
        {isResolved ? (
          <div className="flex items-center justify-center p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/10">
            <span className="text-outline text-xs uppercase tracking-[0.2em] font-bold">
              Winning Outcome:{' '}
            </span>
            <span className="ml-2 text-on-surface font-black">
              {winIdx !== null ? (outcomes[winIdx] ?? `#${winIdx}`) : '—'}
            </span>
          </div>
        ) : status === 'voided' ? (
          <div className="flex items-center justify-center p-4 rounded-xl bg-error/5 border border-error/10">
            <span className="text-error text-xs uppercase tracking-[0.2em] font-bold">Market Voided</span>
          </div>
        ) : status === 'closed' ? (
          <div className="flex items-center justify-center p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/10">
            <span className="text-outline text-xs uppercase tracking-[0.2em] font-bold">
              Awaiting Resolution
            </span>
          </div>
        ) : (
          <div
            className={`grid gap-2`}
            style={{ gridTemplateColumns: `repeat(${Math.min(outcomes.length, 3)}, 1fr)` }}
          >
            {outcomes.map((label, i) => (
              <div
                key={i}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                  i === 0
                    ? 'bg-secondary/10 border-secondary/20 hover:bg-secondary/20'
                    : 'bg-surface-container-highest border-outline-variant/10 hover:bg-surface-container-high'
                }`}
              >
                <span
                  className={`text-xs font-bold ${
                    i === 0 ? 'text-secondary' : 'text-on-surface'
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between pt-4 border-t border-outline-variant/10 relative z-10">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full ${isActive ? 'bg-primary/20' : 'bg-primary/10'} flex items-center justify-center`}>
            <span className={`material-symbols-outlined text-[12px] ${isActive ? 'text-primary' : 'text-primary/50'}`}>
              person
            </span>
          </div>
          <span className={`text-[11px] font-medium ${isActive ? 'text-outline' : 'text-outline/50'}`}>
            {shortPk(m.creator)}
          </span>
        </div>
        <span className="font-mono text-[10px] text-outline/40 truncate max-w-[8rem]">
          {shortPk(m.marketPda)}
        </span>
      </div>
    </Link>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-surface-container border border-outline-variant/5 rounded-2xl p-6 flex flex-col gap-4 animate-pulse">
      <div className="flex justify-between">
        <div className="h-3 w-12 rounded bg-surface-container-highest" />
        <div className="h-5 w-20 rounded bg-surface-container-highest" />
      </div>
      <div className="space-y-2 flex-1">
        <div className="h-4 w-full rounded bg-surface-container-highest" />
        <div className="h-4 w-4/5 rounded bg-surface-container-highest" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-12 rounded-xl bg-surface-container-highest" />
        <div className="h-12 rounded-xl bg-surface-container-highest" />
      </div>
      <div className="flex justify-between pt-4 border-t border-outline-variant/10">
        <div className="h-3 w-16 rounded bg-surface-container-highest" />
        <div className="h-3 w-16 rounded bg-surface-container-highest" />
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ tab }: { tab: Tab }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [all, setAll] = useState<RegisteredMarket[]>([]);
  const [chainRows, setChainRows] = useState<ChainMarketRow[] | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [judgeList, setJudgeList] = useState<DashboardMarketEntry[] | null>(null);
  const [judgesLoading, setJudgesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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
      .then((rows) => { if (!cancelled) setChainRows(rows); })
      .catch((e: Error) => {
        if (!cancelled) {
          setChainError(e?.message ?? 'Failed to load markets from chain');
          setChainRows([]);
        }
      })
      .finally(() => { if (!cancelled) setChainLoading(false); });
    return () => { cancelled = true; };
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
        const slot = await findResolverSlot(connection, wallet, row.marketPda);
        if (slot === null) continue;
        const reg = all.find((m) => m.marketPda === row.marketPda.toBase58());
        matches.push({
          marketPda: row.marketPda.toBase58(),
          creator: row.creator,
          marketId: reg?.marketId ?? null,
          label: reg?.label ?? `On-chain ${row.marketPda.toBase58().slice(0, 4)}…`,
          createdAt: reg?.createdAt ?? 0,
          outcomeCount: row.outcomeCount,
          closeAt: row.closeAt,
          closed: row.closed,
          resolvedOutcomeIndex: row.resolvedOutcomeIndex,
          voided: row.voided,
          resolutionThreshold: row.resolutionThreshold,
        });
      }
      matches.sort((a, b) => b.createdAt - a.createdAt || a.marketPda.localeCompare(b.marketPda));
      if (!cancelled) { setJudgeList(matches); setJudgesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tab, connection, wallet, wallet.publicKey, chainRows, all]);

  const tabs: { id: Tab; label: string; to: string }[] = [
    { id: 'markets', label: 'All markets', to: '/markets' },
    { id: 'creator', label: 'Creator', to: '/creator' },
    { id: 'judges', label: 'Judge', to: '/judges' },
  ];

  const creatorMarkets =
    wallet.publicKey != null
      ? mergedMarkets.filter((m) => m.creator === wallet.publicKey!.toBase58())
      : [];

  const baseList: DashboardMarketEntry[] =
    tab === 'markets' ? mergedMarkets : tab === 'creator' ? creatorMarkets : judgeList ?? [];

  const displayList = useMemo(() => {
    let list = baseList;
    if (statusFilter !== 'all') {
      list = list.filter((m) => getMarketStatus(m) === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.marketPda.toLowerCase().includes(q) ||
          m.creator.toLowerCase().includes(q)
      );
    }
    return list;
  }, [baseList, statusFilter, search]);

  const listLoading = tab === 'judges' ? judgesLoading : chainLoading;

  const statusFilters: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Open' },
    { id: 'closing-soon', label: 'Closing Soon' },
    { id: 'closed', label: 'Closed' },
    { id: 'resolved', label: 'Resolved' },
    { id: 'voided', label: 'Voided' },
  ];

  const pageTitle =
    tab === 'markets' ? 'Global Markets' :
    tab === 'creator' ? 'Your Markets' :
    'Markets You Resolve';

  const pageSubtitle =
    tab === 'markets' ? 'Verified prediction markets on the Solana blockchain.' :
    tab === 'creator' ? 'Markets created by your connected wallet.' :
    'On-chain markets where your wallet is assigned as a resolver.';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim px-4 pt-8 pb-12 md:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">

        {/* ── Page header + filter tabs ─────────────────────────────── */}
        <div className="flex flex-col gap-5 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface italic mb-1">
                {pageTitle}
              </h1>
              <p className="text-outline font-medium">{pageSubtitle}</p>
            </div>

            {/* Status filter dropdown */}
            <div ref={filterRef} className="relative">
              <button
                onClick={() => setFilterOpen(v => !v)}
                className="inline-flex items-center gap-2 h-9 rounded-lg bg-surface-container-highest px-4 text-xs font-bold text-primary hover:bg-surface-variant transition-colors"
              >
                <span className="uppercase tracking-wider">
                  {statusFilters.find(f => f.id === statusFilter)?.label ?? 'All'}
                </span>
                <svg
                  className={`h-4 w-4 text-outline transition-transform ${filterOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20" fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-44 rounded-xl border border-outline-variant/20 bg-surface-container-low py-1.5 shadow-xl shadow-black/40">
                  {statusFilters.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => { setStatusFilter(id); setFilterOpen(false); }}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                        statusFilter === id
                          ? 'text-primary bg-surface-container-highest'
                          : 'text-outline hover:text-on-surface hover:bg-surface-container-highest'
                      }`}
                    >
                      {statusFilter === id && (
                        <span className="material-symbols-outlined text-[14px]">check</span>
                      )}
                      {statusFilter !== id && <span className="w-[14px]" />}
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Search + tab row */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-[20px]">
                search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-surface-container-lowest border-none rounded-xl py-3 pl-12 pr-4 text-on-surface placeholder:text-outline/50 focus:ring-2 focus:ring-primary/30 focus:outline-none transition-all text-sm"
                placeholder="Search markets by title, pubkey, or creator…"
                type="text"
              />
            </div>
            {/* Tab switcher */}
            <div className="flex gap-1 bg-surface-container-low p-1.5 rounded-xl border border-outline-variant/15">
              {tabs.map((t) => (
                <Link
                  key={t.id}
                  to={t.to}
                  className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                    tab === t.id
                      ? 'bg-surface-container-highest text-on-surface'
                      : 'text-outline hover:text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── Error banner ────────────────────────────────────────────── */}
        {chainError && tab !== 'judges' && (
          <div className="mb-8 flex items-start gap-3 rounded-xl bg-tertiary/10 border border-tertiary/20 p-4">
            <span className="material-symbols-outlined text-tertiary text-[18px] mt-0.5">warning</span>
            <p className="text-sm text-tertiary">
              Chain discovery failed: {chainError}. Showing locally saved markets only.
            </p>
          </div>
        )}

        {/* ── Loading skeletons ────────────────────────────────────────── */}
        {listLoading && displayList.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {!listLoading && displayList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-outline">search_off</span>
            </div>
            <div>
              <p className="text-on-surface font-semibold mb-1">
                {search ? 'No markets match your search' : 'No markets found'}
              </p>
              <p className="text-outline text-sm">
                {tab === 'markets' && !search && 'No markets on-chain or in this browser yet.'}
                {tab === 'creator' && 'No markets created by this wallet.'}
                {tab === 'judges' && 'No markets where this wallet is a resolver.'}
                {search && 'Try a different search term.'}
              </p>
            </div>
            {tab === 'markets' && !search && (
              <Link to="/create" className="btn-primary text-sm px-6 py-2.5">
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                Create a market
              </Link>
            )}
          </div>
        )}

        {/* ── Market grid ─────────────────────────────────────────────── */}
        {displayList.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-8">
            {displayList.map((m) => (
              <MarketCard key={m.marketPda} m={m} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
