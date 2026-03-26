import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type NetworkKey = 'localhost' | 'devnet' | 'testnet' | 'mainnet-beta';

export interface NetworkOption {
  key: NetworkKey;
  label: string;
  endpoint: string;
  color: string;
}

export const NETWORKS: NetworkOption[] = [
  {
    key: 'localhost',
    label: 'Localhost',
    endpoint: 'http://127.0.0.1:8899',
    color: 'text-purple-600',
  },
  {
    key: 'devnet',
    label: 'Devnet',
    endpoint: 'https://api.devnet.solana.com',
    color: 'text-yellow-600',
  },
  {
    key: 'testnet',
    label: 'Testnet',
    endpoint: 'https://api.testnet.solana.com',
    color: 'text-blue-600',
  },
  {
    key: 'mainnet-beta',
    label: 'Mainnet',
    endpoint: 'https://api.mainnet-beta.solana.com',
    color: 'text-green-600',
  },
];

/** Tailwind class for the status dot in the header */
export const PRESET_DOT_CLASS: Record<NetworkKey, string> = {
  localhost: 'bg-purple-500',
  devnet: 'bg-yellow-500',
  testnet: 'bg-blue-500',
  'mainnet-beta': 'bg-green-500',
};

export interface CustomRpcEntry {
  id: string;
  label: string;
  url: string;
}

export type NetworkSelection =
  | { type: 'preset'; key: NetworkKey }
  | { type: 'custom'; id: string };

export interface ResolvedNetwork {
  label: string;
  endpoint: string;
  color: string;
  dotClass: string;
  /** Built-in cluster, when applicable */
  presetKey?: NetworkKey;
}

const STORAGE_KEY = 'prediction-market-network';
const CUSTOM_RPCS_KEY = 'prediction-market-custom-rpcs';

function loadCustomRpcs(): CustomRpcEntry[] {
  try {
    const raw = localStorage.getItem(CUSTOM_RPCS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is CustomRpcEntry =>
        x != null &&
        typeof x === 'object' &&
        typeof (x as CustomRpcEntry).id === 'string' &&
        typeof (x as CustomRpcEntry).url === 'string' &&
        typeof (x as CustomRpcEntry).label === 'string'
    );
  } catch {
    return [];
  }
}

function loadSelection(): NetworkSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { type: 'preset', key: 'devnet' };
    if (raw.startsWith('{')) {
      const p = JSON.parse(raw) as { v?: number; preset?: NetworkKey; customId?: string };
      if (p.v === 2 && p.preset && NETWORKS.some((n) => n.key === p.preset))
        return { type: 'preset', key: p.preset };
      if (p.v === 2 && p.customId) return { type: 'custom', id: p.customId };
    }
    const asKey = raw as NetworkKey;
    if (NETWORKS.some((n) => n.key === asKey)) return { type: 'preset', key: asKey };
  } catch {}
  return { type: 'preset', key: 'devnet' };
}

function validateSelection(sel: NetworkSelection, customs: CustomRpcEntry[]): NetworkSelection {
  if (sel.type === 'custom') {
    if (customs.some((c) => c.id === sel.id)) return sel;
    return { type: 'preset', key: 'devnet' };
  }
  return sel;
}

function persistSelection(sel: NetworkSelection) {
  const payload =
    sel.type === 'preset'
      ? JSON.stringify({ v: 2 as const, preset: sel.key })
      : JSON.stringify({ v: 2 as const, customId: sel.id });
  localStorage.setItem(STORAGE_KEY, payload);
}

function persistCustomRpcs(entries: CustomRpcEntry[]) {
  localStorage.setItem(CUSTOM_RPCS_KEY, JSON.stringify(entries));
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url.trim()).hostname || 'Custom';
  } catch {
    return 'Custom';
  }
}

function resolveNetwork(
  selection: NetworkSelection,
  customRpcs: CustomRpcEntry[]
): ResolvedNetwork {
  if (selection.type === 'preset') {
    const n = NETWORKS.find((x) => x.key === selection.key)!;
    return {
      label: n.label,
      endpoint: n.endpoint,
      color: n.color,
      dotClass: PRESET_DOT_CLASS[n.key],
      presetKey: n.key,
    };
  }
  const c = customRpcs.find((x) => x.id === selection.id);
  return {
    label: c?.label ?? 'Custom RPC',
    endpoint: c?.url ?? 'https://api.devnet.solana.com',
    color: 'text-slate-600',
    dotClass: 'bg-slate-500',
  };
}

interface NetworkContextValue {
  network: ResolvedNetwork;
  selection: NetworkSelection;
  customRpcs: CustomRpcEntry[];
  setPreset: (key: NetworkKey) => void;
  selectCustom: (id: string) => void;
  addCustomRpc: (label: string, url: string) => boolean;
  updateCustomRpc: (id: string, label: string, url: string) => boolean;
  removeCustomRpc: (id: string) => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [customRpcs, setCustomRpcs] = useState<CustomRpcEntry[]>(() => loadCustomRpcs());
  const [selection, setSelection] = useState<NetworkSelection>(() =>
    validateSelection(loadSelection(), loadCustomRpcs())
  );

  const setPreset = useCallback((key: NetworkKey) => {
    try {
      persistSelection({ type: 'preset', key });
    } catch {}
    setSelection({ type: 'preset', key });
  }, []);

  const selectCustom = useCallback(
    (id: string) => {
      if (!customRpcs.some((c) => c.id === id)) return;
      try {
        persistSelection({ type: 'custom', id });
      } catch {}
      setSelection({ type: 'custom', id });
    },
    [customRpcs]
  );

  const addCustomRpc = useCallback((label: string, url: string) => {
    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
    const id = crypto.randomUUID();
    const entry: CustomRpcEntry = {
      id,
      label: label.trim() || hostnameFromUrl(trimmed),
      url: trimmed,
    };
    setCustomRpcs((prev) => {
      const next = [...prev, entry];
      try {
        persistCustomRpcs(next);
      } catch {}
      return next;
    });
    try {
      persistSelection({ type: 'custom', id });
    } catch {}
    setSelection({ type: 'custom', id });
    return true;
  }, []);

  const updateCustomRpc = useCallback((id: string, label: string, url: string) => {
    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
    setCustomRpcs((prev) => {
      const next = prev.map((c) =>
        c.id === id ? { ...c, label: label.trim() || hostnameFromUrl(trimmed), url: trimmed } : c
      );
      try {
        persistCustomRpcs(next);
      } catch {}
      return next;
    });
    return true;
  }, []);

  const removeCustomRpc = useCallback((id: string) => {
    setCustomRpcs((prev) => {
      const next = prev.filter((c) => c.id !== id);
      try {
        persistCustomRpcs(next);
      } catch {}
      return next;
    });
    setSelection((sel) => {
      if (sel.type === 'custom' && sel.id === id) {
        const fallback: NetworkSelection = { type: 'preset', key: 'devnet' };
        try {
          persistSelection(fallback);
        } catch {}
        return fallback;
      }
      return sel;
    });
  }, []);

  const network = useMemo(
    () => resolveNetwork(selection, customRpcs),
    [selection, customRpcs]
  );

  const value = useMemo(
    () => ({
      network,
      selection,
      customRpcs,
      setPreset,
      selectCustom,
      addCustomRpc,
      updateCustomRpc,
      removeCustomRpc,
    }),
    [
      network,
      selection,
      customRpcs,
      setPreset,
      selectCustom,
      addCustomRpc,
      updateCustomRpc,
      removeCustomRpc,
    ]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used inside NetworkProvider');
  return ctx;
}
