import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  fetchUserProfile,
  upsertUserProfile,
  closeUserProfile,
  type UserProfileData,
} from '@/lib/marketActions';
import { useToast } from '@/context/ToastContext';

const MAX_DISPLAY_NAME = 50;
const MAX_URL = 100;

export default function Settings() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const toast = useToast();

  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!wallet.publicKey) return;
    let cancelled = false;
    setLoading(true);
    fetchUserProfile(connection, wallet, wallet.publicKey)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        if (p) {
          setDisplayName(p.displayName);
          setUrl(p.url);
        }
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [wallet.publicKey?.toBase58()]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    if (displayName.length > MAX_DISPLAY_NAME) {
      setSaveError(`Display name must be ≤ ${MAX_DISPLAY_NAME} characters.`);
      return;
    }
    if (url.length > MAX_URL) {
      setSaveError(`URL must be ≤ ${MAX_URL} characters.`);
      return;
    }
    setSaving(true);
    try {
      await upsertUserProfile(connection, wallet, displayName.trim(), url.trim());
      const updated = await fetchUserProfile(connection, wallet, wallet.publicKey!);
      setProfile(updated);
      setSaveSuccess(true);
      toast.success('Profile saved.');
    } catch (err: any) {
      const msg = err?.message ?? 'Transaction failed.';
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    setCloseError(null);
    setClosing(true);
    try {
      await closeUserProfile(connection, wallet);
      setProfile(null);
      setDisplayName('');
      setUrl('');
      setConfirmDelete(false);
      toast.success('Profile removed from chain.');
    } catch (err: any) {
      const msg = err?.message ?? 'Transaction failed.';
      setCloseError(msg);
      toast.error(msg);
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim px-4 pt-8 pb-12 md:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">

        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface italic mb-1">
          Profile settings
        </h1>
        <p className="text-outline font-medium mb-8">
          Optional on-chain profile linked to your wallet. Costs ~0.0017 SOL in rent (refunded on delete).
        </p>

        {loading ? (
          <div className="card p-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-outline animate-spin text-[20px]">progress_activity</span>
            <span className="text-outline text-sm">Loading profile…</span>
          </div>
        ) : (
          <div className="space-y-8">

            {/* Verified badge (read-only) */}
            {profile?.verified && (
              <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-secondary/10 border border-secondary/20">
                <span className="material-symbols-outlined text-secondary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                <div>
                  <p className="text-sm font-bold text-secondary">Verified account</p>
                  <p className="text-xs text-on-surface-variant">This profile has been verified by the platform authority.</p>
                </div>
              </div>
            )}

            {/* Profile form */}
            <section className="card p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-on-surface mb-1">
                  {profile ? 'Update profile' : 'Create profile'}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {profile
                    ? 'Changes are written directly to the Solana blockchain.'
                    : 'No profile found for this wallet. Create one below.'}
                </p>
              </div>

              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1.5">
                    Display name
                    <span className="ml-2 text-xs text-outline font-normal">(optional, ≤{MAX_DISPLAY_NAME} chars)</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => { setDisplayName(e.target.value); setSaveSuccess(false); }}
                    maxLength={MAX_DISPLAY_NAME}
                    placeholder="e.g. Alice"
                    className="input w-full"
                  />
                  <p className="mt-1 text-xs text-outline text-right">{displayName.length}/{MAX_DISPLAY_NAME}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1.5">
                    URL
                    <span className="ml-2 text-xs text-outline font-normal">(optional, ≤{MAX_URL} chars)</span>
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setSaveSuccess(false); }}
                    maxLength={MAX_URL}
                    placeholder="https://example.com"
                    className="input w-full"
                  />
                  <p className="mt-1 text-xs text-outline text-right">{url.length}/{MAX_URL}</p>
                </div>

                {saveError && (
                  <div className="flex items-start gap-2 rounded-xl bg-error/10 border border-error/20 p-4">
                    <span className="material-symbols-outlined text-error text-[16px] mt-0.5">error</span>
                    <p className="text-sm text-error">{saveError}</p>
                  </div>
                )}

                {saveSuccess && (
                  <div className="flex items-start gap-2 rounded-xl bg-secondary/10 border border-secondary/20 p-4">
                    <span className="material-symbols-outlined text-secondary text-[16px] mt-0.5">check_circle</span>
                    <p className="text-sm text-secondary">Profile saved successfully.</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && (
                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                  )}
                  {saving ? 'Saving…' : profile ? 'Save changes' : 'Create profile'}
                </button>
              </form>
            </section>

            {/* Danger zone */}
            {profile && (
              <section className="card p-6 border border-error/20 space-y-4">
                <h2 className="text-lg font-bold text-error">Danger zone</h2>
                <p className="text-sm text-on-surface-variant">
                  Deleting your profile closes the on-chain account and refunds ~0.0017 SOL in rent.
                  Your verified status will be lost.
                </p>

                {closeError && (
                  <div className="flex items-start gap-2 rounded-xl bg-error/10 border border-error/20 p-4">
                    <span className="material-symbols-outlined text-error text-[16px] mt-0.5">error</span>
                    <p className="text-sm text-error">{closeError}</p>
                  </div>
                )}

                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-4 py-2 rounded-lg border border-error/30 text-error text-sm font-bold hover:bg-error/10 transition-colors"
                  >
                    Delete profile
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={closing}
                      className="px-4 py-2 rounded-lg bg-error text-on-error text-sm font-bold disabled:opacity-50 flex items-center gap-2 hover:opacity-90 transition-opacity"
                    >
                      {closing && (
                        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      )}
                      {closing ? 'Deleting…' : 'Confirm delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-4 py-2 rounded-lg text-outline text-sm font-bold hover:text-on-surface transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
