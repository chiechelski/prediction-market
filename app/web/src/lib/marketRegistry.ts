export const REGISTRY_STORAGE_KEY = 'prediction-market.registry.v1';

/** Fired on this window after local registry writes (same-tab updates). */
export const REGISTRY_CHANGED_EVENT = 'prediction-market-registry-changed';

function notifyRegistryChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(REGISTRY_CHANGED_EVENT));
  }
}

export type RegisteredMarket = {
  marketPda: string;
  creator: string;
  /** u64 used in market PDA seeds */
  marketId: string;
  label?: string;
  createdAt: number;
};

function readAll(): RegisteredMarket[] {
  try {
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RegisteredMarket =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as RegisteredMarket).marketPda === 'string' &&
        typeof (x as RegisteredMarket).creator === 'string' &&
        typeof (x as RegisteredMarket).marketId === 'string'
    );
  } catch {
    return [];
  }
}

function writeAll(entries: RegisteredMarket[]) {
  localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(entries));
}

export function listRegisteredMarkets(): RegisteredMarket[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function registerMarket(entry: Omit<RegisteredMarket, 'createdAt'> & { createdAt?: number }) {
  const all = readAll();
  const next: RegisteredMarket = {
    ...entry,
    createdAt: entry.createdAt ?? Date.now(),
  };
  const idx = all.findIndex((m) => m.marketPda === next.marketPda);
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  writeAll(all);
  notifyRegistryChanged();
}

export function getRegisteredMarket(marketPda: string): RegisteredMarket | undefined {
  return readAll().find((m) => m.marketPda === marketPda);
}

export function removeRegisteredMarket(marketPda: string) {
  writeAll(readAll().filter((m) => m.marketPda !== marketPda));
  notifyRegistryChanged();
}
