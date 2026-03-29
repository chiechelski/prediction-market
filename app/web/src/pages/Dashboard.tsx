import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  listRegisteredMarkets,
  REGISTRY_CHANGED_EVENT,
  REGISTRY_STORAGE_KEY,
  type RegisteredMarket,
} from '@/lib/marketRegistry';
import {
  fetchAllMarketsFromChain,
  fetchMarketCategories,
  mergeRegistryAndChain,
  categoryNameMap,
  getMarketStatus,
  formatTimeLeft,
  marketMatchesSector,
  inferMarketSectorSlug,
  type ChainMarketRow,
  type ChainMarketCategory,
  type DashboardMarketEntry,
  type MarketStatus,
} from '@/lib/marketDiscovery';
import {
  findResolverSlot,
  fetchUserProfileReadOnly,
  type UserProfileData,
} from '@/lib/marketActions';
import { resolveCreatorDisplayName, shortCreatorAddress } from '@/lib/creatorIdentity';
import { UNCATEGORIZED_PUBKEY_STR } from '@/lib/marketCategories';
import MarketSectorBanner from '@/components/MarketSectorBanner';

type Tab = 'markets' | 'creator' | 'judges';
type StatusFilter = 'all' | 'open' | 'closing-soon' | 'closed' | 'resolved' | 'voided';
type MarketKindFilter = 'all' | 'completeSet' | 'parimutuel';
type SortBy = 'newest' | 'closing' | 'title';

function marketTitleForSort(m: DashboardMarketEntry): string {
  const t = m.title?.trim();
  if (t) return t;
  const l = m.label?.trim();
  if (l) return l;
  return m.marketPda;
}

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
function marketDisplayTitle(m: DashboardMarketEntry): string {
  const t = m.title?.trim();
  if (t) return t;
  const l = m.label?.trim();
  if (l) return l;
  return 'Market';
}

function MarketCard({
  m,
  creatorProfile,
}: {
  m: DashboardMarketEntry;
  /** `undefined` = still loading on-chain profile for this creator */
  creatorProfile: UserProfileData | null | undefined;
}) {
  const navigate = useNavigate();
  const status = getMarketStatus(m);
  const outcomes = parseOutcomeLabels(m.label, m.outcomeCount ?? 2);
  const winIdx = m.resolvedOutcomeIndex ?? null;
  const isResolved = status === 'resolved';
  const isActive = status === 'open' || status === 'closing-soon';
  const creatorLabel = resolveCreatorDisplayName(m.creator, creatorProfile);
  const pubkeyShort = shortCreatorAddress(m.creator);
  const showWalletLine = creatorLabel !== pubkeyShort;

  const cardBg =
    isResolved || status === 'voided' || status === 'closed'
      ? 'bg-surface-container/50 grayscale-[0.2]'
      : 'bg-surface-container hover:bg-surface-container-low';

  const goMarket = () => navigate(`/market/${m.marketPda}`);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={goMarket}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goMarket();
        }
      }}
      className={`group ${cardBg} border border-outline-variant/5 rounded-2xl flex flex-col transition-all duration-300 relative overflow-hidden cursor-pointer`}
    >
      <MarketSectorBanner category={m.category} variant="card" />

      <div className="p-6 flex flex-col flex-1 min-h-0">
      {/* Ambient glow for active markets */}
      {isActive && (
        <div className="absolute top-[72px] right-4 w-32 h-32 bg-secondary/5 blur-[40px] rounded-full pointer-events-none z-[1]" />
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
      <div className="mb-8 flex flex-col gap-2 relative z-10">
        {m.category && (
          <span className="inline-flex w-fit items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
            {m.category}
          </span>
        )}
        {m.marketKind === 'parimutuel' && (
          <span className="inline-flex w-fit items-center rounded-md bg-tertiary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-tertiary">
            Pari-mutuel pool
          </span>
        )}
        <h3
          className={`font-headline text-xl font-bold leading-snug flex-1 ${
            isResolved || status === 'voided' ? 'text-on-surface/60' : 'text-on-surface'
          }`}
        >
          {marketDisplayTitle(m)}
        </h3>
      </div>

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
      <div
        className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-outline-variant/10 relative z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          to={`/markets/creator/${encodeURIComponent(m.creator)}`}
          onClick={(e) => e.stopPropagation()}
          className="flex min-w-0 items-center gap-3 rounded-xl -m-1 p-1 text-left transition-colors hover:bg-surface-container-high/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          title="View all markets by this creator"
        >
          <div className={`relative shrink-0 w-9 h-9 rounded-full ${isActive ? 'bg-primary/25 ring-2 ring-primary/20' : 'bg-primary/15'} flex items-center justify-center`}>
            <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-primary' : 'text-primary/60'}`}>
              person
            </span>
            {creatorProfile?.verified && (
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-surface-dim"
                title="Verified account"
              >
                <span
                  className="material-symbols-outlined text-[11px] leading-none"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified_user
                </span>
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-outline/80">
              Market creator
            </p>
            <p
              className={`text-sm font-semibold truncate ${isActive ? 'text-on-surface' : 'text-on-surface/70'}`}
            >
              {creatorLabel}
            </p>
            {showWalletLine && (
              <p className={`font-mono text-[10px] truncate ${isActive ? 'text-outline/70' : 'text-outline/40'}`}>
                {pubkeyShort}
              </p>
            )}
          </div>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] text-outline/40 truncate max-w-[5rem] hidden sm:inline" title={m.marketPda}>
            {shortPk(m.marketPda)}
          </span>
        </div>
      </div>
      </div>
    </div>
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
const SECTOR_BROWSE: { sector: string; label: string }[] = [
  { sector: 'all', label: 'All Markets' },
  { sector: 'sports', label: 'Sports' },
  { sector: 'crypto', label: 'Crypto' },
  { sector: 'politics', label: 'Politics' },
  { sector: 'economics', label: 'Economics' },
];

const STATUS_FILTER_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'closing-soon', label: 'Closing Soon' },
  { id: 'closed', label: 'Closed' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'voided', label: 'Voided' },
];

function categoryChipActive(
  chip: 'all' | '__uncat__' | string,
  categoryFilter: 'all' | '__uncat__' | string,
  browseSector: string
): boolean {
  if (chip === 'all') {
    return categoryFilter === 'all' && browseSector === 'all';
  }
  if (chip === '__uncat__') {
    return categoryFilter === '__uncat__' && browseSector === 'all';
  }
  return (
    categoryFilter === chip ||
    (browseSector !== 'all' && marketMatchesSector(chip, browseSector))
  );
}

export default function Dashboard({
  tab,
  creatorPubkey,
}: {
  tab: Tab;
  /** When set, show only markets from this wallet (creator profile view). */
  creatorPubkey?: string;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();
  const browseSector = searchParams.get('sector') ?? 'all';
  const [all, setAll] = useState<RegisteredMarket[]>([]);
  const [chainRows, setChainRows] = useState<ChainMarketRow[] | null>(null);
  const [chainCategoryLabels, setChainCategoryLabels] = useState<
    Map<string, string>
  >(new Map());
  const [chainCategories, setChainCategories] = useState<ChainMarketCategory[]>(
    []
  );
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [judgeList, setJudgeList] = useState<DashboardMarketEntry[] | null>(null);
  const [judgesLoading, setJudgesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [marketKindFilter, setMarketKindFilter] = useState<MarketKindFilter>('all');
  /** `'__uncat__'` = no category label; otherwise exact `m.category` string. */
  const [categoryFilter, setCategoryFilter] = useState<'all' | '__uncat__' | string>(
    'all'
  );
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [toolbarMenu, setToolbarMenu] = useState<
    null | 'category' | 'marketType' | 'sort' | 'status'
  >(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setToolbarMenu(null);
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
    Promise.all([
      fetchAllMarketsFromChain(connection),
      fetchMarketCategories(connection),
    ])
      .then(([rows, cats]) => {
        if (!cancelled) {
          setChainRows(rows);
          setChainCategories(cats);
          setChainCategoryLabels(categoryNameMap(cats));
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setChainError(e?.message ?? 'Failed to load markets from chain');
          setChainRows([]);
          setChainCategories([]);
          setChainCategoryLabels(new Map());
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
    () => mergeRegistryAndChain(all, chainRows ?? [], chainCategoryLabels),
    [all, chainRows, chainCategoryLabels]
  );

  const creatorKeys = useMemo(() => {
    const uniq = new Set(mergedMarkets.map((m) => m.creator));
    if (creatorPubkey) uniq.add(creatorPubkey);
    return [...uniq].sort().join('\n');
  }, [mergedMarkets, creatorPubkey]);

  const [profilesByCreator, setProfilesByCreator] = useState<
    Record<string, UserProfileData | null>
  >({});

  useEffect(() => {
    const creators = creatorKeys ? creatorKeys.split('\n').filter(Boolean) : [];
    if (creators.length === 0) {
      setProfilesByCreator({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        creators.map(async (c) => {
          try {
            const p = await fetchUserProfileReadOnly(connection, new PublicKey(c));
            return [c, p] as const;
          } catch {
            return [c, null] as const;
          }
        })
      );
      if (!cancelled) {
        setProfilesByCreator(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, creatorKeys]);

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
          label: reg?.label ?? '',
          title:
            row.title?.trim() ||
            reg?.title ||
            `On-chain ${row.marketPda.toBase58().slice(0, 4)}…`,
          category:
            row.categoryPubkey === UNCATEGORIZED_PUBKEY_STR
              ? reg?.category
              : chainCategoryLabels.get(row.categoryPubkey) ?? reg?.category,
          createdAt: reg?.createdAt ?? 0,
          outcomeCount: row.outcomeCount,
          closeAt: row.closeAt,
          closed: row.closed,
          resolvedOutcomeIndex: row.resolvedOutcomeIndex,
          voided: row.voided,
          resolutionThreshold: row.resolutionThreshold,
          marketKind: row.marketKind,
        });
      }
      matches.sort((a, b) => b.createdAt - a.createdAt || a.marketPda.localeCompare(b.marketPda));
      if (!cancelled) { setJudgeList(matches); setJudgesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tab, connection, wallet, wallet.publicKey, chainRows, all, chainCategoryLabels]);

  const tabs: { id: Tab; label: string; to: string }[] = [
    { id: 'markets', label: 'All markets', to: '/markets' },
    { id: 'creator', label: 'My markets', to: '/creator' },
    { id: 'judges', label: 'Your resolutions', to: '/judges' },
  ];

  const creatorMarkets =
    wallet.publicKey != null
      ? mergedMarkets.filter((m) => m.creator === wallet.publicKey!.toBase58())
      : [];

  const baseList: DashboardMarketEntry[] = creatorPubkey
    ? mergedMarkets.filter((m) => m.creator === creatorPubkey)
    : tab === 'markets'
      ? mergedMarkets
      : tab === 'creator'
        ? creatorMarkets
        : judgeList ?? [];

  const creatorProfileDisplayName = useMemo(() => {
    if (!creatorPubkey) return null;
    return profilesByCreator[creatorPubkey]?.displayName?.trim() ?? null;
  }, [creatorPubkey, profilesByCreator]);

  const displayList = useMemo(() => {
    let list = baseList;
    if (statusFilter !== 'all') {
      list = list.filter((m) => getMarketStatus(m) === statusFilter);
    }
    if ((tab === 'markets' || creatorPubkey) && browseSector !== 'all') {
      list = list.filter((m) => marketMatchesSector(m.category, browseSector));
    } else if (categoryFilter === '__uncat__') {
      list = list.filter((m) => !m.category);
    } else if (categoryFilter !== 'all') {
      list = list.filter((m) => m.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          (m.title?.toLowerCase().includes(q) ?? false) ||
          (m.category?.toLowerCase().includes(q) ?? false) ||
          (profilesByCreator[m.creator]?.displayName?.toLowerCase().includes(q) ??
            false) ||
          m.marketPda.toLowerCase().includes(q) ||
          m.creator.toLowerCase().includes(q)
      );
    }
    if (marketKindFilter !== 'all') {
      list = list.filter((m) => {
        const k = m.marketKind ?? 'completeSet';
        return k === marketKindFilter;
      });
    }
    const next = [...list];
    switch (sortBy) {
      case 'closing':
        next.sort((a, b) => {
          const ca = a.closeAt ?? 0;
          const cb = b.closeAt ?? 0;
          if (ca !== cb) return ca - cb;
          return a.marketPda.localeCompare(b.marketPda);
        });
        break;
      case 'title':
        next.sort((a, b) =>
          marketTitleForSort(a).localeCompare(marketTitleForSort(b), undefined, {
            sensitivity: 'base',
          })
        );
        break;
      case 'newest':
      default:
        next.sort(
          (a, b) =>
            b.createdAt - a.createdAt || a.marketPda.localeCompare(b.marketPda)
        );
        break;
    }
    return next;
  }, [
    baseList,
    statusFilter,
    categoryFilter,
    search,
    marketKindFilter,
    tab,
    browseSector,
    sortBy,
    creatorPubkey,
    profilesByCreator,
  ]);

  const categoryChipNames = useMemo(() => {
    const names = chainCategories
      .filter((c) => c.active)
      .map((c) => c.name)
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [chainCategories]);

  const categoryToolbarLabel = useMemo(() => {
    if ((tab === 'markets' || creatorPubkey) && browseSector !== 'all') {
      return (
        SECTOR_BROWSE.find((s) => s.sector === browseSector)?.label ?? 'Browse'
      );
    }
    if (categoryFilter === '__uncat__') return 'Uncategorized';
    if (categoryFilter !== 'all') return categoryFilter;
    return 'Category';
  }, [tab, browseSector, categoryFilter, creatorPubkey]);

  const marketTypeToolbarLabel =
    marketKindFilter === 'completeSet'
      ? 'Complete-set'
      : marketKindFilter === 'parimutuel'
        ? 'Pari-mutuel'
        : 'Market type';

  const sortToolbarLabel =
    sortBy === 'closing'
      ? 'Closing soon'
      : sortBy === 'title'
        ? 'Title A–Z'
        : 'Sort: newest';

  const statusToolbarLabel =
    STATUS_FILTER_OPTIONS.find((f) => f.id === statusFilter)?.label ?? 'Status';

  const filtersAreNonDefault =
    statusFilter !== 'all' ||
    marketKindFilter !== 'all' ||
    categoryFilter !== 'all' ||
    browseSector !== 'all' ||
    sortBy !== 'newest' ||
    search.trim().length > 0;

  const resetFilters = () => {
    setStatusFilter('all');
    setMarketKindFilter('all');
    setCategoryFilter('all');
    setSortBy('newest');
    setSearch('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('sector');
      return next;
    });
    setToolbarMenu(null);
  };

  const listLoading = creatorPubkey ? chainLoading : tab === 'judges' ? judgesLoading : chainLoading;

  const pageTitle = creatorPubkey
    ? creatorProfileDisplayName ?? `Creator · ${shortPk(creatorPubkey)}`
    : tab === 'markets'
      ? 'Global Markets'
      : tab === 'creator'
        ? 'Your Markets'
        : 'Markets You Resolve';

  const pageSubtitle = creatorPubkey
    ? creatorProfileDisplayName
      ? `Wallet ${shortPk(creatorPubkey)} · markets discovered on-chain and in this browser.`
      : `All markets from wallet ${creatorPubkey.slice(0, 8)}…${creatorPubkey.slice(-6)} (on-chain + local registry).`
    : tab === 'markets'
      ? 'Verified prediction markets on the Solana blockchain.'
      : tab === 'creator'
        ? 'Markets created by your connected wallet.'
        : 'On-chain markets where your wallet is assigned as a resolver.';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim px-4 pt-8 pb-12 md:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">

        {/* ── Page header + compact filter toolbar ───────────────────── */}
        <div className="mb-8 flex flex-col gap-4">
          {creatorPubkey && (
            <nav className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-outline">
              <Link to="/markets" className="transition-colors hover:text-primary">
                Markets
              </Link>
              <span className="material-symbols-outlined text-[12px]">chevron_right</span>
              <span className="text-on-surface-variant">Creator</span>
            </nav>
          )}
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface italic">
                {pageTitle}
              </h1>
              {creatorPubkey && profilesByCreator[creatorPubkey]?.verified && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-secondary/35 bg-secondary/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-secondary"
                  title="Verified account"
                >
                  <span
                    className="material-symbols-outlined text-[14px] leading-none"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    verified_user
                  </span>
                  Verified
                </span>
              )}
            </div>
            <p className="font-medium text-outline">{pageSubtitle}</p>
          </div>

          <div
            ref={toolbarRef}
            className="flex flex-col gap-3 rounded-2xl border border-outline-variant/15 bg-surface-container-low/40 p-3 sm:p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {/* Category */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setToolbarMenu((m) => (m === 'category' ? null : 'category'))
                    }
                    className={`inline-flex h-10 max-w-[11rem] items-center gap-1.5 rounded-xl border px-3.5 text-left text-sm font-medium transition-colors sm:max-w-[14rem] ${
                      toolbarMenu === 'category'
                        ? 'border-primary/40 bg-surface-container-high text-on-surface ring-1 ring-primary/25'
                        : 'border-outline-variant/25 bg-surface-container-highest text-on-surface hover:border-outline-variant/40'
                    }`}
                  >
                    <span className="truncate">{categoryToolbarLabel}</span>
                    <span className="material-symbols-outlined ml-auto shrink-0 text-[18px] text-outline">
                      expand_more
                    </span>
                  </button>
                  {toolbarMenu === 'category' && (
                    <div className="absolute left-0 top-full z-50 mt-1 max-h-[min(70vh,22rem)] w-[min(calc(100vw-2rem),16rem)] overflow-y-auto rounded-xl border border-outline-variant/20 bg-surface-container-low py-1 shadow-xl shadow-black/40">
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter('all');
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev);
                            next.delete('sector');
                            return next;
                          });
                          setToolbarMenu(null);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold ${
                          categoryChipActive('all', categoryFilter, browseSector)
                            ? 'bg-surface-container-highest text-primary'
                            : 'text-on-surface-variant hover:bg-surface-container-highest'
                        }`}
                      >
                        All categories
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter('__uncat__');
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev);
                            next.delete('sector');
                            return next;
                          });
                          setToolbarMenu(null);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold ${
                          categoryChipActive('__uncat__', categoryFilter, browseSector)
                            ? 'bg-surface-container-highest text-primary'
                            : 'text-on-surface-variant hover:bg-surface-container-highest'
                        }`}
                      >
                        Uncategorized
                      </button>
                      {tab === 'markets' && (
                        <>
                          <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-widest text-outline">
                            Browse
                          </p>
                          {SECTOR_BROWSE.map(({ sector, label }) => (
                            <button
                              key={sector}
                              type="button"
                              onClick={() => {
                                setCategoryFilter('all');
                                setSearchParams((prev) => {
                                  const next = new URLSearchParams(prev);
                                  if (sector === 'all') next.delete('sector');
                                  else next.set('sector', sector);
                                  return next;
                                });
                                setToolbarMenu(null);
                              }}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium ${
                                sector === 'all'
                                  ? browseSector === 'all' &&
                                    categoryFilter === 'all'
                                    ? 'bg-surface-container-highest text-primary'
                                    : 'text-on-surface-variant hover:bg-surface-container-highest'
                                  : browseSector === sector
                                    ? 'bg-surface-container-highest text-primary'
                                    : 'text-on-surface-variant hover:bg-surface-container-highest'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </>
                      )}
                      {categoryChipNames.length > 0 && (
                        <>
                          <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-widest text-outline">
                            Categories
                          </p>
                          {categoryChipNames.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                setCategoryFilter(c);
                                const slug = inferMarketSectorSlug(c);
                                setSearchParams((prev) => {
                                  const next = new URLSearchParams(prev);
                                  if (slug) next.set('sector', slug);
                                  else next.delete('sector');
                                  return next;
                                });
                                setToolbarMenu(null);
                              }}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium ${
                                categoryChipActive(c, categoryFilter, browseSector)
                                  ? 'bg-surface-container-highest text-primary'
                                  : 'text-on-surface-variant hover:bg-surface-container-highest'
                              }`}
                            >
                              {c}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Market type */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setToolbarMenu((m) => (m === 'marketType' ? null : 'marketType'))
                    }
                    className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium transition-colors ${
                      toolbarMenu === 'marketType'
                        ? 'border-primary/40 bg-surface-container-high text-on-surface ring-1 ring-primary/25'
                        : 'border-outline-variant/25 bg-surface-container-highest text-on-surface hover:border-outline-variant/40'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px] text-outline">
                      filter_list
                    </span>
                    <span className="hidden sm:inline">{marketTypeToolbarLabel}</span>
                    <span className="sm:hidden">Type</span>
                    <span className="material-symbols-outlined text-[18px] text-outline">
                      expand_more
                    </span>
                  </button>
                  {toolbarMenu === 'marketType' && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-outline-variant/20 bg-surface-container-low py-1 shadow-xl shadow-black/40">
                      {(
                        [
                          ['all', 'All types'],
                          ['completeSet', 'Complete-set'],
                          ['parimutuel', 'Pari-mutuel'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setMarketKindFilter(id);
                            setToolbarMenu(null);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold ${
                            marketKindFilter === id
                              ? 'bg-surface-container-highest text-primary'
                              : 'text-on-surface-variant hover:bg-surface-container-highest'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sort */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setToolbarMenu((m) => (m === 'sort' ? null : 'sort'))
                    }
                    className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium transition-colors ${
                      toolbarMenu === 'sort'
                        ? 'border-primary/40 bg-surface-container-high text-on-surface ring-1 ring-primary/25'
                        : 'border-outline-variant/25 bg-surface-container-highest text-on-surface hover:border-outline-variant/40'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px] text-outline">
                      swap_vert
                    </span>
                    <span className="hidden max-w-[9rem] truncate sm:inline">
                      {sortToolbarLabel}
                    </span>
                    <span className="sm:hidden">Sort</span>
                    <span className="material-symbols-outlined text-[18px] text-outline">
                      expand_more
                    </span>
                  </button>
                  {toolbarMenu === 'sort' && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-outline-variant/20 bg-surface-container-low py-1 shadow-xl shadow-black/40">
                      {(
                        [
                          ['newest', 'Newest first'],
                          ['closing', 'Closing soon'],
                          ['title', 'Title A–Z'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setSortBy(id);
                            setToolbarMenu(null);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold ${
                            sortBy === id
                              ? 'bg-surface-container-highest text-primary'
                              : 'text-on-surface-variant hover:bg-surface-container-highest'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setToolbarMenu((m) => (m === 'status' ? null : 'status'))
                    }
                    className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium transition-colors ${
                      toolbarMenu === 'status'
                        ? 'border-primary/40 bg-surface-container-high text-on-surface ring-1 ring-primary/25'
                        : 'border-outline-variant/25 bg-surface-container-highest text-on-surface hover:border-outline-variant/40'
                    }`}
                  >
                    <span className="max-w-[6rem] truncate sm:max-w-none">
                      {statusToolbarLabel}
                    </span>
                    <span className="material-symbols-outlined shrink-0 text-[18px] text-outline">
                      expand_more
                    </span>
                  </button>
                  {toolbarMenu === 'status' && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-outline-variant/20 bg-surface-container-low py-1 shadow-xl shadow-black/40 sm:left-0 sm:right-auto">
                      {STATUS_FILTER_OPTIONS.map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setStatusFilter(id);
                            setToolbarMenu(null);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider ${
                            statusFilter === id
                              ? 'bg-surface-container-highest text-primary'
                              : 'text-on-surface-variant hover:bg-surface-container-highest'
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

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 lg:min-w-0 lg:flex-1 lg:justify-end">
                <div className="relative min-w-0 flex-1 lg:max-w-md">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline">
                    search
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/15 bg-surface-container-lowest py-2.5 pl-10 pr-3 text-sm text-on-surface placeholder:text-outline/50 focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder={creatorPubkey ? "Search this creator's markets…" : 'Search markets…'}
                    type="search"
                    autoComplete="off"
                  />
                </div>
                {!creatorPubkey && (
                  <div className="flex gap-1 rounded-xl border border-outline-variant/15 bg-surface-container-low p-1 sm:shrink-0">
                    {tabs.map((t) => (
                      <Link
                        key={t.id}
                        to={t.to}
                        className={`rounded-lg px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider transition-all sm:px-4 ${
                          tab === t.id
                            ? 'bg-surface-container-highest text-on-surface'
                            : 'text-outline hover:bg-surface-container-highest hover:text-on-surface'
                        }`}
                      >
                        {t.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {filtersAreNonDefault && (
              <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant/10 pt-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Active filters
                </span>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-lg border border-outline-variant/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10"
                >
                  Clear all
                </button>
              </div>
            )}
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
                {creatorPubkey && !search && 'No markets found for this creator in the current discovery set.'}
                {!creatorPubkey && tab === 'markets' && !search && 'No markets on-chain or in this browser yet.'}
                {!creatorPubkey && tab === 'creator' && 'No markets created by this wallet.'}
                {!creatorPubkey && tab === 'judges' && 'No markets where this wallet is a resolver.'}
                {search && 'Try a different search term.'}
              </p>
            </div>
            {tab === 'markets' && !search && !creatorPubkey && (
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
              <MarketCard
                key={m.marketPda}
                m={m}
                creatorProfile={profilesByCreator[m.creator]}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
