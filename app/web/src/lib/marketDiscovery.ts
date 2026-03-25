import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { fetchIdl } from '@/lib/program';
import type { RegisteredMarket } from '@/lib/marketRegistry';

const DUMMY_WALLET = {
  publicKey: new PublicKey('11111111111111111111111111111111'),
  signTransaction: async (t: unknown) => t,
  signAllTransactions: async (ts: unknown) => ts,
};

export type ChainMarketRow = {
  marketPda: PublicKey;
  creator: string;
  outcomeCount: number;
};

export type DashboardMarketEntry = {
  marketPda: string;
  creator: string;
  marketId: string | null;
  label: string;
  createdAt: number;
  outcomeCount?: number;
};

function shortPk(pda: string) {
  return `${pda.slice(0, 4)}…${pda.slice(-4)}`;
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
  return rows.map((row: { publicKey: PublicKey; account: any }) => ({
    marketPda: row.publicKey,
    creator: row.account.creator.toBase58(),
    outcomeCount: row.account.outcomeCount as number,
  }));
}

export function mergeRegistryAndChain(
  registry: RegisteredMarket[],
  chain: ChainMarketRow[]
): DashboardMarketEntry[] {
  const seen = new Set<string>();
  const out: DashboardMarketEntry[] = [];

  for (const r of registry) {
    seen.add(r.marketPda);
    const c = chain.find((x) => x.marketPda.toBase58() === r.marketPda);
    out.push({
      marketPda: r.marketPda,
      creator: r.creator,
      marketId: r.marketId,
      label: r.label ?? 'Market',
      createdAt: r.createdAt,
      outcomeCount: c?.outcomeCount,
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
      label: `On-chain ${shortPk(key)}`,
      createdAt: 0,
      outcomeCount: c.outcomeCount,
    });
  }

  out.sort(
    (a, b) =>
      b.createdAt - a.createdAt || a.marketPda.localeCompare(b.marketPda)
  );
  return out;
}
