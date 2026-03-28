import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { fetchIdl } from '@/lib/program';
import { UNCATEGORIZED_PUBKEY_STR } from '@/lib/marketCategories';
import type { RegisteredMarket } from '@/lib/marketRegistry';

const DUMMY_WALLET = {
  publicKey: new PublicKey('11111111111111111111111111111111'),
  signTransaction: async (t: unknown) => t,
  signAllTransactions: async (ts: unknown) => ts,
};

export type ChainMarketCategory = {
  pubkey: PublicKey;
  id: string;
  name: string;
  active: boolean;
};

export type ChainMarketRow = {
  marketPda: PublicKey;
  creator: string;
  outcomeCount: number;
  closeAt: number;
  closed: boolean;
  resolvedOutcomeIndex: number | null;
  voided: boolean;
  resolutionThreshold: number;
  title: string;
  /** Base58 category PDA; `1111…` = uncategorized. */
  categoryPubkey: string;
  /** From on-chain `market_type`. */
  marketKind: 'completeSet' | 'parimutuel';
};

export type DashboardMarketEntry = {
  marketPda: string;
  creator: string;
  marketId: string | null;
  /** Slash-separated outcome labels for UI chips. */
  label: string;
  /** Display title (falls back to label for legacy registry rows). */
  title?: string;
  category?: string;
  /** Local-only creator display name from registry. */
  creatorDisplayName?: string;
  createdAt: number;
  outcomeCount?: number;
  closeAt?: number;
  closed?: boolean;
  resolvedOutcomeIndex?: number | null;
  voided?: boolean;
  resolutionThreshold?: number;
  /** Omitted = treat as complete-set (legacy registry). */
  marketKind?: 'completeSet' | 'parimutuel';
};

export type MarketStatus = 'open' | 'closing-soon' | 'closed' | 'resolved' | 'voided';

export function getMarketStatus(entry: DashboardMarketEntry): MarketStatus {
  if (entry.voided) return 'voided';
  if (entry.resolvedOutcomeIndex !== undefined && entry.resolvedOutcomeIndex !== null) return 'resolved';
  if (entry.closed) return 'closed';
  if (entry.closeAt) {
    const now = Date.now() / 1000;
    const left = entry.closeAt - now;
    if (left <= 0) return 'closed';
    if (left < 86400 * 2) return 'closing-soon';
  }
  return 'open';
}

export function formatTimeLeft(closeAt: number): string {
  const now = Date.now() / 1000;
  const diff = closeAt - now;
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** URL `?sector=` values: heuristic match on category label for browsing. */
export function marketMatchesSector(
  category: string | undefined,
  sector: string | null
): boolean {
  if (!sector || sector === 'all') return true;
  const c = (category ?? '').toLowerCase();
  switch (sector) {
    case 'sports':
      return /sport|football|soccer|match|nba|nfl|olymp|tennis|basketball|f1|formula|cricket|rugby|hockey|mlb|ufc/i.test(
        c
      );
    case 'crypto':
      return /crypto|bitcoin|btc|eth|sol|defi|token|blockchain|nft|stablecoin/i.test(c);
    case 'politics':
      return /politic|election|government|parliament|president|vote|referendum|congress|senate/i.test(
        c
      );
    case 'economics':
      return /econ|gdp|inflation|fed|stock|finance|macro|interest|recession|employment|cpi/i.test(
        c
      );
    default:
      return true;
  }
}

export type MarketSectorSlug = 'sports' | 'crypto' | 'politics' | 'economics';

/** First matching sector for breadcrumbs / deep links; order avoids double-matching. */
export function inferMarketSectorSlug(
  category: string | undefined
): MarketSectorSlug | null {
  if (!category?.trim()) return null;
  const order: MarketSectorSlug[] = [
    'sports',
    'crypto',
    'politics',
    'economics',
  ];
  for (const s of order) {
    if (marketMatchesSector(category, s)) return s;
  }
  return null;
}

function shortPk(pda: string) {
  return `${pda.slice(0, 4)}…${pda.slice(-4)}`;
}

export async function fetchMarketCategories(
  connection: Connection
): Promise<ChainMarketCategory[]> {
  const idl = await fetchIdl();
  const provider = new AnchorProvider(connection, DUMMY_WALLET as any, {
    commitment: 'confirmed',
  });
  const program = new Program(idl, provider);
  const rows = await (program.account as any).marketCategory.all();
  return rows.map((row: { publicKey: PublicKey; account: any }) => ({
    pubkey: row.publicKey,
    id: (row.account.id as BN).toString(10),
    name: String(row.account.name ?? ''),
    active: row.account.active as boolean,
  }));
}

/** Map category PDA (base58) → display name (active categories only). */
export function categoryNameMap(
  cats: ChainMarketCategory[]
): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of cats) {
    if (c.active) m.set(c.pubkey.toBase58(), c.name);
  }
  return m;
}

export async function fetchAllMarketsFromChain(
  connection: Connection
): Promise<ChainMarketRow[]> {
  const idl = await fetchIdl();
  const provider = new AnchorProvider(connection, DUMMY_WALLET as any, {
    commitment: 'confirmed',
  });
  const program = new Program(idl, provider);
  const rows = await (program.account as any).market.all();
  return rows.map((row: { publicKey: PublicKey; account: any }) => {
    const mt = row.account.marketType;
    const marketKind =
      mt && typeof mt === 'object' && 'parimutuel' in mt
        ? 'parimutuel'
        : 'completeSet';
    return {
      marketPda: row.publicKey,
      creator: row.account.creator.toBase58(),
      outcomeCount: row.account.outcomeCount as number,
      closeAt: Number(row.account.closeAt),
      closed: row.account.closed as boolean,
      resolvedOutcomeIndex:
        row.account.resolvedOutcomeIndex !== null &&
        row.account.resolvedOutcomeIndex !== undefined
          ? Number(row.account.resolvedOutcomeIndex)
          : null,
      voided: row.account.voided as boolean,
      resolutionThreshold: row.account.resolutionThreshold as number,
      title: String(row.account.title ?? ''),
      categoryPubkey: (row.account.category as PublicKey).toBase58(),
      marketKind,
    };
  });
}

function resolveCategoryLabel(
  categoryPubkey: string,
  labels: Map<string, string>,
  registryFallback?: string
): string | undefined {
  if (categoryPubkey === UNCATEGORIZED_PUBKEY_STR) {
    return registryFallback;
  }
  return labels.get(categoryPubkey) ?? registryFallback;
}

export function mergeRegistryAndChain(
  registry: RegisteredMarket[],
  chain: ChainMarketRow[],
  labels: Map<string, string>
): DashboardMarketEntry[] {
  const seen = new Set<string>();
  const out: DashboardMarketEntry[] = [];

  for (const r of registry) {
    seen.add(r.marketPda);
    const c = chain.find((x) => x.marketPda.toBase58() === r.marketPda);
    const outcomeLabel = r.label ?? 'Yes / No';
    out.push({
      marketPda: r.marketPda,
      creator: r.creator,
      marketId: r.marketId,
      label: outcomeLabel,
      title: c?.title?.trim() || r.title,
      category: c
        ? resolveCategoryLabel(c.categoryPubkey, labels, r.category)
        : r.category,
      creatorDisplayName: r.creatorDisplayName,
      createdAt: r.createdAt,
      outcomeCount: c?.outcomeCount,
      closeAt: c?.closeAt,
      closed: c?.closed,
      resolvedOutcomeIndex: c?.resolvedOutcomeIndex,
      voided: c?.voided,
      resolutionThreshold: c?.resolutionThreshold,
      marketKind: c?.marketKind,
    });
  }

  for (const c of chain) {
    const key = c.marketPda.toBase58();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      marketPda: key,
      creator: c.creator,
      marketId: null,
      label: '',
      title: c.title?.trim() || `On-chain ${shortPk(key)}`,
      category: resolveCategoryLabel(c.categoryPubkey, labels, undefined),
      createdAt: 0,
      outcomeCount: c.outcomeCount,
      closeAt: c.closeAt,
      closed: c.closed,
      resolvedOutcomeIndex: c.resolvedOutcomeIndex,
      voided: c.voided,
      resolutionThreshold: c.resolutionThreshold,
      marketKind: c.marketKind,
    });
  }

  out.sort(
    (a, b) =>
      b.createdAt - a.createdAt || a.marketPda.localeCompare(b.marketPda)
  );
  return out;
}
