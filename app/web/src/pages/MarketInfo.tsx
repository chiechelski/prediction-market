import { useParams, Link } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useCallback, useEffect, useState } from 'react';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { fetchIdl } from '@/lib/program';
import {
  getRegisteredMarket,
  registerMarket,
  patchRegisteredMarket,
  REGISTRY_CHANGED_EVENT,
} from '@/lib/marketRegistry';
import MarketSectorBanner from '@/components/MarketSectorBanner';
import {
  fetchUserProfileReadOnly,
  type UserProfileData,
} from '@/lib/marketActions';
import { resolveCreatorDisplayName } from '@/lib/creatorIdentity';
import { useToast } from '@/context/ToastContext';

export default function MarketInfo() {
  const { marketKey } = useParams<{ marketKey: string }>();
  const { connection } = useConnection();
  const wallet = useWallet();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chainTitle, setChainTitle] = useState('');
  const [chainCreator, setChainCreator] = useState('');
  const [outcomeCount, setOutcomeCount] = useState(2);
  const [categoryName, setCategoryName] = useState<string | null>(null);

  const [creatorDisplayName, setCreatorDisplayName] = useState('');
  const [detailsText, setDetailsText] = useState('');
  const [savedVersion, setSavedVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<
    UserProfileData | null | undefined
  >(undefined);

  const load = useCallback(async () => {
    if (!marketKey) return;
    setLoading(true);
    setError(null);
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
      const account = await (program.account as any).market.fetch(
        new PublicKey(marketKey)
      );
      setChainTitle(String(account.title ?? '').trim());
      setChainCreator((account.creator as PublicKey).toBase58());
      setOutcomeCount(Number(account.outcomeCount) || 2);
      const catPk = account.category as PublicKey;
      if (catPk.equals(PublicKey.default)) {
        setCategoryName(null);
      } else {
        try {
          const cat = await (program.account as any).marketCategory.fetch(catPk);
          setCategoryName(String(cat.name ?? '').trim() || null);
        } catch {
          setCategoryName(null);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load market');
    } finally {
      setLoading(false);
    }
  }, [connection, marketKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!chainCreator) {
      setCreatorProfile(undefined);
      return;
    }
    let cancelled = false;
    setCreatorProfile(undefined);
    fetchUserProfileReadOnly(connection, new PublicKey(chainCreator))
      .then((p) => {
        if (!cancelled) setCreatorProfile(p);
      })
      .catch(() => {
        if (!cancelled) setCreatorProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, chainCreator]);

  const registry = marketKey ? getRegisteredMarket(marketKey) : undefined;

  useEffect(() => {
    setCreatorDisplayName(registry?.creatorDisplayName?.trim() ?? '');
    setDetailsText(registry?.detailsText ?? '');
  }, [registry, savedVersion]);

  useEffect(() => {
    function onReg() {
      setSavedVersion((v) => v + 1);
    }
    window.addEventListener(REGISTRY_CHANGED_EVENT, onReg);
    return () => window.removeEventListener(REGISTRY_CHANGED_EVENT, onReg);
  }, []);

  const displayCategory = categoryName ?? registry?.category;
  const displayTitle =
    chainTitle || registry?.title?.trim() || `Market ${marketKey?.slice(0, 8)}…`;

  const creatorDisplayResolved = chainCreator
    ? resolveCreatorDisplayName(
        chainCreator,
        creatorProfile,
        registry?.creatorDisplayName
      )
    : '';

  const isCreator =
    wallet.publicKey != null &&
    chainCreator !== '' &&
    wallet.publicKey.toBase58() === chainCreator;

  const handleSave = () => {
    if (!marketKey || !registry || !isCreator) return;
    setSaving(true);
    setSaveError(null);
    try {
      const name = creatorDisplayName.trim();
      const details = detailsText.trim();
      patchRegisteredMarket(marketKey, {
        creatorDisplayName: name || undefined,
        detailsText: details || undefined,
      });
      toast.success('Listing details saved in this browser.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNewRegistry = () => {
    if (!marketKey || !wallet.publicKey || !isCreator) return;
    const idStr = window.prompt(
      'Enter the decimal market id from when this market was created (same as in your records). Required to save local metadata:'
    );
    if (idStr == null) return;
    const marketId = idStr.trim();
    if (!/^\d+$/.test(marketId)) {
      setSaveError('Market id must be a decimal integer.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const defaultLabel = Array.from({ length: outcomeCount }, (_, i) => `Outcome ${i + 1}`).join(' / ');
      registerMarket({
        marketPda: marketKey,
        creator: chainCreator,
        marketId,
        title: chainTitle || registry?.title,
        category: displayCategory,
        label: registry?.label ?? defaultLabel,
        creatorDisplayName: creatorDisplayName.trim() || undefined,
        detailsText: detailsText.trim() || undefined,
      });
      toast.success('Listing details saved in this browser.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-outline">Loading…</p>
      </div>
    );
  }
  if (error || !marketKey) {
    return (
      <div className="card p-8 text-center max-w-lg mx-auto">
        <p className="text-on-surface-variant">{error ?? 'Invalid market.'}</p>
        <Link to="/markets" className="mt-4 inline-block text-primary">
          ← Markets
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim px-4 pt-8 pb-12 md:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to={`/market/${marketKey}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-outline hover:text-on-surface transition-colors"
        >
          ← Back to market
        </Link>

        <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-surface-container-low">
          <MarketSectorBanner category={displayCategory} variant="hero" showLabel />
          <div className="p-6 md:p-8 space-y-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-outline">
                Extended info
              </p>
              <h1 className="font-headline mt-1 text-2xl font-extrabold tracking-tight text-on-surface md:text-3xl">
                {displayTitle}
              </h1>
              {displayCategory && (
                <p className="mt-2">
                  <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                    {displayCategory}
                  </span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-outline-variant/10 bg-surface-container-lowest/80 p-4">
              <div className="relative h-12 w-12 shrink-0 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px] text-primary">person</span>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-outline">
                  Market creator
                </p>
                <p className="flex flex-wrap items-center gap-2 font-semibold text-on-surface">
                  <span>{creatorDisplayResolved}</span>
                  {creatorProfile?.verified && (
                    <span className="flex items-center gap-1 text-sm font-bold text-secondary">
                      <span
                        className="material-symbols-outlined text-[16px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        verified_user
                      </span>
                      Yes
                    </span>
                  )}
                </p>
                <p className="font-mono text-xs text-outline">{chainCreator}</p>
                {creatorProfile?.url?.trim() && (
                  <a
                    href={
                      creatorProfile.url.trim().match(/^https?:\/\//i)
                        ? creatorProfile.url.trim()
                        : `https://${creatorProfile.url.trim()}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-xs font-medium text-primary hover:underline"
                  >
                    {creatorProfile.url.trim()}
                  </a>
                )}
              </div>
            </div>

            <div className="prose prose-invert max-w-none">
              {registry?.detailsText?.trim() ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">
                  {registry.detailsText.trim()}
                </div>
              ) : (
                <p className="text-sm text-outline italic">
                  No extended description has been added for this market in this browser yet.
                </p>
              )}
            </div>

            {isCreator && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
                <p className="text-sm font-semibold text-on-surface">
                  {registry ? 'Edit local listing details' : 'Add local listing details'}
                </p>
                <p className="text-xs text-outline leading-relaxed">
                  Display name and long description are stored only in this browser&apos;s registry (not on-chain).
                </p>
                <div>
                  <label className="block text-xs font-medium text-outline">Creator display name</label>
                  <input
                    type="text"
                    value={creatorDisplayName}
                    onChange={(e) => setCreatorDisplayName(e.target.value)}
                    placeholder="e.g. SportsOracle_V3"
                    className="input mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-outline">Rules, context, links</label>
                  <textarea
                    value={detailsText}
                    onChange={(e) => setDetailsText(e.target.value)}
                    placeholder="Resolution sources, tie-breakers, official feeds…"
                    className="input mt-1 min-h-[160px] w-full text-sm"
                    rows={6}
                  />
                </div>
                {saveError && (
                  <p className="text-sm text-error">{saveError}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {registry ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSave}
                      className="btn-primary disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveNewRegistry}
                      className="btn-primary disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save (enter market id once)'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {!isCreator && wallet.publicKey && (
              <p className="text-xs text-outline">
                Connect as the market creator wallet to edit local details.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
