import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { fetchUserProfile, type UserProfileData } from '@/lib/marketActions';
import {
  useNetwork,
  NETWORKS,
  PRESET_DOT_CLASS,
  type CustomRpcEntry,
} from '@/context/NetworkContext';

const nav = [
  { to: '/markets', label: 'Markets' },
  { to: '/creator', label: 'Creator' },
  { to: '/judges', label: 'Judges' },
  { to: '/create', label: 'Create' },
  { to: '/platform', label: 'Platform' },
  { to: '/docs', label: 'Docs' },
];

function CustomRpcRow({
  entry,
  selected,
  onSelect,
  onEdit,
  onRemove,
}: {
  entry: CustomRpcEntry;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`group flex w-full items-center gap-1 rounded-lg px-1 py-0.5 ${
        selected ? 'bg-surface-container' : ''
      }`}
    >
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-surface-container ${
          selected ? 'font-semibold text-on-surface' : 'text-on-surface-variant'
        }`}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-outline" />
        <span className="min-w-0 flex-1 truncate text-left">{entry.label}</span>
        {selected && (
          <svg className="h-4 w-4 shrink-0 text-primary" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="shrink-0 rounded p-1.5 text-outline opacity-0 transition-opacity hover:bg-surface-container-high hover:text-on-surface-variant group-hover:opacity-100"
        title="Edit RPC"
        aria-label="Edit RPC"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="shrink-0 rounded p-1.5 text-outline opacity-0 transition-opacity hover:bg-error/10 hover:text-error group-hover:opacity-100"
        title="Remove RPC"
        aria-label="Remove RPC"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

function NetworkSelector() {
  const {
    network,
    selection,
    customRpcs,
    setPreset,
    selectCustom,
    addCustomRpc,
    updateCustomRpc,
    removeCustomRpc,
  } = useNetwork();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAddOpen(false);
        setEditingId(null);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleAdd() {
    setAddError(null);
    const ok = addCustomRpc(newLabel, newUrl);
    if (!ok) { setAddError('Enter a valid URL (http:// or https://).'); return; }
    setNewLabel('');
    setNewUrl('');
    setAddOpen(false);
  }

  function startEdit(entry: CustomRpcEntry) {
    setEditingId(entry.id);
    setEditLabel(entry.label);
    setEditUrl(entry.url);
    setEditError(null);
    setAddOpen(false);
  }

  function handleSaveEdit() {
    if (!editingId) return;
    setEditError(null);
    const ok = updateCustomRpc(editingId, editLabel, editUrl);
    if (!ok) { setEditError('Enter a valid URL (http:// or https://).'); return; }
    setEditingId(null);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 h-9 rounded-lg bg-surface-container-highest px-4 text-xs font-bold text-primary hover:bg-surface-variant transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${network.dotClass}`} />
        <span className="min-w-0 max-w-[8rem] truncate">{network.label}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-outline transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(80vh,32rem)] w-[min(calc(100vw-2rem),22rem)] overflow-y-auto rounded-xl border border-outline-variant/20 bg-surface-container-low py-2 shadow-xl shadow-black/40">
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-outline">
            Clusters
          </p>
          {NETWORKS.map((n) => {
            const selected = selection.type === 'preset' && selection.key === n.key;
            return (
              <button
                key={n.key}
                role="option"
                aria-selected={selected}
                onClick={() => { setPreset(n.key); setOpen(false); setAddOpen(false); setEditingId(null); }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-surface-container ${
                  selected ? 'font-semibold text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${PRESET_DOT_CLASS[n.key]}`} />
                <span className="flex-1 text-left">{n.label}</span>
                {selected && (
                  <svg className="h-4 w-4 text-primary" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}

          <div className="mx-3 my-2 border-t border-outline-variant/15" />
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-outline">
            Custom RPC
          </p>

          {customRpcs.map((entry) =>
            editingId === entry.id ? (
              <div key={entry.id} className="space-y-2 px-3 py-2">
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="Display name"
                  className="input text-sm py-1.5"
                />
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://…"
                  className="input font-mono text-xs py-1.5"
                  autoComplete="off"
                  spellCheck={false}
                />
                {editError && <p className="text-xs text-error">{editError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={handleSaveEdit} className="btn-primary flex-1 py-1.5 text-xs">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="btn-secondary py-1.5 text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <CustomRpcRow
                key={entry.id}
                entry={entry}
                selected={selection.type === 'custom' && selection.id === entry.id}
                onSelect={() => { selectCustom(entry.id); setOpen(false); }}
                onEdit={() => startEdit(entry)}
                onRemove={() => removeCustomRpc(entry.id)}
              />
            )
          )}

          {addOpen ? (
            <div className="space-y-2 px-3 py-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Name (optional)"
                className="input text-sm py-1.5"
              />
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://api.devnet.solana.com"
                className="input font-mono text-xs py-1.5"
                autoComplete="off"
                spellCheck={false}
              />
              {addError && <p className="text-xs text-error">{addError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={handleAdd} className="btn-primary flex-1 py-1.5 text-xs">
                  Add RPC
                </button>
                <button
                  type="button"
                  onClick={() => { setAddOpen(false); setAddError(null); }}
                  className="btn-secondary py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setAddOpen(true); setEditingId(null); setAddError(null); }}
              className="mx-3 mt-1 flex w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant/30 py-2 text-xs font-medium text-outline hover:border-primary/40 hover:text-primary transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add custom RPC
            </button>
          )}

          <div className="mx-3 mt-2 border-t border-outline-variant/15 pt-2">
            <p className="break-all px-0 py-1 font-mono text-[10px] leading-snug text-outline">
              {network.endpoint}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const sideNav = [
  { to: '/markets', label: 'Markets', icon: 'leaderboard' },
  { to: '/creator', label: 'Creator', icon: 'person' },
  { to: '/judges', label: 'Judges', icon: 'gavel' },
  { to: '/platform', label: 'Platform', icon: 'tune' },
  { to: '/settings', label: 'Settings', icon: 'manage_accounts' },
];

function WalletAvatar({ address }: { address: string }) {
  const initials = address.slice(0, 2).toUpperCase();
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/40 to-primary-container/60 flex items-center justify-center shrink-0">
      <span className="text-sm font-black text-primary font-headline">{initials}</span>
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { connected, publicKey } = wallet;
  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : '';

  const [sidebarProfile, setSidebarProfile] = useState<UserProfileData | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) { setSidebarProfile(null); return; }
    let cancelled = false;
    fetchUserProfile(connection, wallet, publicKey)
      .then((p) => { if (!cancelled) setSidebarProfile(p); })
      .catch(() => { if (!cancelled) setSidebarProfile(null); });
    return () => { cancelled = true; };
  }, [connected, publicKey?.toBase58()]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-surface">

      {/* ── Top Nav ─────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-background shadow-[0_1px_0_0_rgba(73,68,85,0.15)]">
        <div className="flex justify-between items-center w-full px-8 h-16 max-w-[1920px] mx-auto">

          {/* Brand + top nav links (hidden on xl when sidebar is shown) */}
          <div className="flex items-center gap-10">
            <Link to="/" className="text-xl font-black tracking-tighter text-primary uppercase italic font-headline">
              Sovereign Oracle
            </Link>
            {/* Top nav links — hide on xl only when sidebar is active (connected) */}
            <div className={`hidden md:flex items-center gap-6 ${connected ? 'xl:hidden' : ''}`}>
              {(connected ? nav : nav.filter(({ to }) => to === '/docs')).map(({ to, label }) => {
                const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`font-label text-xs tracking-tight transition-colors ${
                      active
                        ? 'text-primary border-b-2 border-primary pb-0.5 font-bold'
                        : 'text-outline hover:text-primary'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            {connected && (
              <div className="hidden lg:flex items-center bg-surface-container-lowest px-3 py-1.5 rounded-lg border border-outline-variant/10">
                <span className="material-symbols-outlined text-outline mr-2 text-[18px] leading-none">search</span>
                <input
                  className="bg-transparent border-none text-xs focus:ring-0 focus:outline-none text-on-surface-variant w-40 placeholder:text-outline"
                  placeholder="Search markets..."
                  type="text"
                />
              </div>
            )}
            <NetworkSelector />
            <WalletMultiButton />
            {connected && (
              <div className="flex items-center gap-1 text-outline">
                <button className="p-1.5 hover:bg-surface-container-highest rounded-full transition-colors" aria-label="Notifications">
                  <span className="material-symbols-outlined text-[20px] leading-none">notifications</span>
                </button>
                <button className="p-1.5 hover:bg-surface-container-highest rounded-full transition-colors" aria-label="Settings">
                  <span className="material-symbols-outlined text-[20px] leading-none">settings</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Body (sidebar + main) ────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">

        {/* ── Sidebar (xl+, authenticated only) ───────────────────── */}
        {connected && (
          <aside className="hidden min-h-0 shrink-0 border-r border-outline-variant/10 bg-background py-6 xl:flex xl:w-64 xl:flex-col z-40">

            {/* Wallet identity */}
            <div className="px-6 mb-8">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/10">
                <WalletAvatar address={publicKey?.toBase58() ?? ''} />
                <div className="overflow-hidden flex-1 min-w-0">
                  {sidebarProfile?.displayName ? (
                    <div className="flex items-center gap-1 min-w-0">
                      <div className="text-on-surface truncate font-bold text-sm">{sidebarProfile.displayName}</div>
                      {sidebarProfile.verified && (
                        <span
                          className="material-symbols-outlined text-secondary text-[14px] shrink-0"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                          title="Verified account"
                        >verified_user</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-on-surface truncate font-bold text-sm">{shortAddress}</div>
                  )}
                  <div className="text-outline text-[10px] uppercase tracking-wider">
                    {sidebarProfile?.displayName ? shortAddress : 'Connected'}
                  </div>
                </div>
              </div>
            </div>

            {/* Nav items */}
            <div className="flex min-h-0 flex-1 flex-col gap-1 px-4">
              {sideNav.map(({ to, label, icon }) => {
                const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      active
                        ? 'bg-surface-container-highest text-primary border-l-4 border-primary-container translate-x-0.5'
                        : 'text-outline hover:bg-surface-container-low hover:text-on-surface'
                    }`}
                  >
                    <span
                      className="material-symbols-outlined text-[20px]"
                      style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    >
                      {icon}
                    </span>
                    {label}
                  </Link>
                );
              })}
              <Link
                to="/docs"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  location.pathname === '/docs'
                    ? 'bg-surface-container-highest text-primary border-l-4 border-primary-container translate-x-0.5'
                    : 'text-outline hover:bg-surface-container-low hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">description</span>
                Docs
              </Link>
            </div>

            {/* Bottom actions */}
            <div className="mt-auto shrink-0 space-y-3 px-4">
              <button
                onClick={() => navigate('/create')}
                className="w-full bg-surface-container-highest border border-outline-variant/20 text-primary py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-surface-bright hover:border-primary/30 transition-all text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                Create Market
              </button>
              <div className="pt-3 border-t border-outline-variant/10">
                <a href="#" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-outline hover:bg-surface-container-low hover:text-on-surface transition-all">
                  <span className="material-symbols-outlined text-[16px]">help</span>
                  Support
                </a>
              </div>
            </div>
          </aside>
        )}

        {/* ── Main content ─────────────────────────────────────────── */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto scrollbar-gutter-stable">
          <Outlet />
        </main>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="bg-surface-container-lowest border-t border-outline-variant/10">
        <div className="w-full py-8 px-12 flex flex-col md:flex-row justify-between items-center gap-6 max-w-[1920px] mx-auto">
          <div className="flex flex-col items-center md:items-start gap-1">
            <span className="text-sm font-black text-primary font-headline uppercase italic tracking-tighter">
              Sovereign Oracle
            </span>
            <span className="text-[10px] uppercase tracking-widest text-outline">
              © 2026 Sovereign Oracle. Built on Solana.
            </span>
          </div>
          <div className="flex items-center gap-8">
            {['Privacy Policy', 'Terms of Service', 'Discord', 'Twitter'].map((label) => (
              <a
                key={label}
                href="#"
                className="text-[10px] uppercase tracking-widest text-outline hover:text-primary transition-colors opacity-80 hover:opacity-100 font-label"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </footer>

    </div>
  );
}
