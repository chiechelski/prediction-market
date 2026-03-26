import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { fetchIdl } from '@/lib/program';
import { PROGRAM_ID } from '@/lib/program';
import { deriveGlobalConfig, deriveAllowedMint } from '@/lib/pda';
import { getTreasuryAtaInfo, fetchUserProfile, verifyUserProfile, type UserProfileData } from '@/lib/marketActions';

type ConfigState = {
  authority: string;
  secondaryAuthority: string;
  platformFeeBps: number;
  platformTreasury: string;
  platformFeeLamports: number;
} | null;

export default function Platform() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [config, setConfig] = useState<ConfigState>(null);
  const [loading, setLoading] = useState(true);

  const [secondaryAuthority, setSecondaryAuthority] = useState('');
  const [platformFeeBps, setPlatformFeeBps] = useState(100);
  const [platformTreasury, setPlatformTreasury] = useState('');
  const [platformFeeLamports, setPlatformFeeLamports] = useState(357_000);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [newMint, setNewMint] = useState('');
  const [addMintLoading, setAddMintLoading] = useState(false);
  const [addMintError, setAddMintError] = useState<string | null>(null);

  const [removingMint, setRemovingMint] = useState<string | null>(null);
  const [removeMintError, setRemoveMintError] = useState<string | null>(null);

  const [allowedMints, setAllowedMints] = useState<string[]>([]);
  const [allowedMintsLoading, setAllowedMintsLoading] = useState(false);

  const [ataLookupMint, setAtaLookupMint] = useState('');
  const [ataLookupResult, setAtaLookupResult] = useState<{ ata: string; exists: boolean } | null>(null);
  const [ataLookupLoading, setAtaLookupLoading] = useState(false);
  const [ataLookupError, setAtaLookupError] = useState<string | null>(null);

  const [verifyTarget, setVerifyTarget] = useState('');
  const [verifyTargetProfile, setVerifyTargetProfile] = useState<UserProfileData | null | 'not-found'>('not-found');
  const [verifyTargetLoading, setVerifyTargetLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);

  const globalConfigPda = deriveGlobalConfig(PROGRAM_ID);

  useEffect(() => {
    if (!wallet.publicKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const idl = await fetchIdl();
        const provider = new AnchorProvider(connection, wallet as any, {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed',
        });
        const program = new Program(idl, provider);
        const account = await (program.account as any).globalConfig.fetch(
          globalConfigPda
        );
        if (!cancelled) {
          const secAuth = (account.secondaryAuthority as PublicKey).toBase58();
          const DEFAULT_PK = '11111111111111111111111111111111';
          setConfig({
            authority: account.authority.toBase58(),
            secondaryAuthority: secAuth === DEFAULT_PK ? '' : secAuth,
            platformFeeBps: account.platformFeeBps,
            platformTreasury: account.platformTreasury.toBase58(),
            platformFeeLamports: account.platformFeeLamports?.toNumber?.() ?? 0,
          });
          setSecondaryAuthority(secAuth === DEFAULT_PK ? '' : secAuth);
          setPlatformFeeBps(account.platformFeeBps);
          setPlatformTreasury(account.platformTreasury.toBase58());
          setPlatformFeeLamports(account.platformFeeLamports?.toNumber?.() ?? 0);
        }
      } catch {
        if (!cancelled) setConfig(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [connection, wallet.publicKey]);

  const walletAddr = wallet.publicKey?.toBase58();
  const isAuthority = config && walletAddr && (
    config.authority === walletAddr ||
    (config.secondaryAuthority !== '' && config.secondaryAuthority === walletAddr)
  );

  const handleInitConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !platformTreasury.trim()) return;
    setUpdateLoading(true);
    setUpdateError(null);
    try {
      const idl = await fetchIdl();
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      });
      const program = new Program(idl, provider);
      const treasuryPubkey = new PublicKey(platformTreasury.trim());
      const BN = (await import('bn.js')).default;
      const DEFAULT_PK = new PublicKey('11111111111111111111111111111111');
      const secAuthPubkey = secondaryAuthority.trim() ? new PublicKey(secondaryAuthority.trim()) : DEFAULT_PK;
      await program.methods
        .initializeConfig(secAuthPubkey, platformFeeBps, treasuryPubkey, new BN(platformFeeLamports))
        .accounts({
          globalConfig: globalConfigPda,
          authority: wallet.publicKey,
          secondaryAuthority: secAuthPubkey,
          systemProgram: DEFAULT_PK,
        })
        .rpc({ skipPreflight: false });
      setConfig({
            authority: wallet.publicKey.toBase58(),
            secondaryAuthority: secondaryAuthority.trim(),
            platformFeeBps,
            platformTreasury: treasuryPubkey.toBase58(),
            platformFeeLamports,
          });
    } catch (err: any) {
      setUpdateError(err?.message ?? 'Transaction failed');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !platformTreasury.trim()) return;
    setUpdateLoading(true);
    setUpdateError(null);
    try {
      const idl = await fetchIdl();
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      });
      const program = new Program(idl, provider);
      const treasuryPubkey = new PublicKey(platformTreasury.trim());
      const BN = (await import('bn.js')).default;
      const DEFAULT_PK = new PublicKey('11111111111111111111111111111111');
      const secAuthPubkey = secondaryAuthority.trim() ? new PublicKey(secondaryAuthority.trim()) : DEFAULT_PK;
      await program.methods
        .updateConfig(secAuthPubkey, platformFeeBps, treasuryPubkey, new BN(platformFeeLamports))
        .accounts({
          globalConfig: globalConfigPda,
          authority: wallet.publicKey,
          newAuthority: wallet.publicKey, // keep same primary; user can change via the field
        })
        .rpc({ skipPreflight: false });
      setConfig((c) => c ? { ...c, platformFeeBps, platformTreasury: treasuryPubkey.toBase58(), platformFeeLamports, secondaryAuthority: secondaryAuthority.trim() } : null);
    } catch (err: any) {
      setUpdateError(err?.message ?? 'Transaction failed');
    } finally {
      setUpdateLoading(false);
    }
  };

  const loadAllowedMints = async () => {
    setAllowedMintsLoading(true);
    try {
      const idl = await fetchIdl();
      const dummy = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: async (t: any) => t,
        signAllTransactions: async (ts: any) => ts,
      };
      const provider = new AnchorProvider(connection, dummy as any, { commitment: 'confirmed' });
      const program = new Program(idl, provider);
      const rows = await (program.account as any).allowedMint.all();
      setAllowedMints(rows.map((r: any) => (r.account.mint as PublicKey).toBase58()));
    } catch {
      setAllowedMints([]);
    } finally {
      setAllowedMintsLoading(false);
    }
  };

  // Load allowed mints whenever the connection changes or config loads
  useEffect(() => {
    loadAllowedMints();
  }, [connection]);

  const handleAddMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !newMint.trim()) return;
    setAddMintLoading(true);
    setAddMintError(null);
    try {
      const idl = await fetchIdl();
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      });
      const program = new Program(idl, provider);
      const mintPubkey = new PublicKey(newMint.trim());
      const allowedMintPda = deriveAllowedMint(program.programId, mintPubkey);
      await program.methods
        .addAllowedCollateralMint()
        .accounts({
          allowedMint: allowedMintPda,
          globalConfig: globalConfigPda,
          authority: wallet.publicKey,
          mint: mintPubkey,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
        })
        .rpc({ skipPreflight: false });
      setNewMint('');
      await loadAllowedMints();
    } catch (err: any) {
      setAddMintError(err?.message ?? 'Transaction failed');
    } finally {
      setAddMintLoading(false);
    }
  };

  const handleRemoveMint = async (mintAddress: string) => {
    if (!wallet.publicKey) return;
    setRemovingMint(mintAddress);
    setRemoveMintError(null);
    try {
      const idl = await fetchIdl();
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      });
      const program = new Program(idl, provider);
      const mintPubkey = new PublicKey(mintAddress);
      const allowedMintPda = deriveAllowedMint(program.programId, mintPubkey);
      await program.methods
        .removeAllowedCollateralMint()
        .accounts({
          allowedMint: allowedMintPda,
          globalConfig: globalConfigPda,
          authority: wallet.publicKey,
          mint: mintPubkey,
        })
        .rpc({ skipPreflight: false });
      await loadAllowedMints();
    } catch (err: any) {
      setRemoveMintError(err?.message ?? 'Transaction failed');
    } finally {
      setRemovingMint(null);
    }
  };

  const handleAtaLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config?.platformTreasury || !ataLookupMint.trim()) return;
    setAtaLookupLoading(true);
    setAtaLookupError(null);
    setAtaLookupResult(null);
    try {
      const mintPubkey = new PublicKey(ataLookupMint.trim());
      const treasury = new PublicKey(config.platformTreasury);
      const { ata, exists } = await getTreasuryAtaInfo(connection, treasury, mintPubkey);
      setAtaLookupResult({ ata: ata.toBase58(), exists });
    } catch (err: any) {
      setAtaLookupError(err?.message ?? 'Lookup failed');
    } finally {
      setAtaLookupLoading(false);
    }
  };

  const handleVerifyLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyTarget.trim()) return;
    setVerifyTargetLoading(true);
    setVerifyTargetProfile('not-found');
    setVerifyError(null);
    setVerifySuccess(null);
    try {
      const targetPubkey = new PublicKey(verifyTarget.trim());
      const profile = await fetchUserProfile(connection, wallet, targetPubkey);
      setVerifyTargetProfile(profile ?? null);
    } catch (err: any) {
      setVerifyError(err?.message ?? 'Lookup failed');
    } finally {
      setVerifyTargetLoading(false);
    }
  };

  const handleSetVerified = async (verified: boolean) => {
    setVerifyLoading(true);
    setVerifyError(null);
    setVerifySuccess(null);
    try {
      const targetPubkey = new PublicKey(verifyTarget.trim());
      await verifyUserProfile(connection, wallet, targetPubkey, verified);
      setVerifyTargetProfile((prev) =>
        prev && prev !== 'not-found' ? { ...prev, verified } : prev
      );
      setVerifySuccess(verified ? 'Profile marked as verified.' : 'Verification removed.');
    } catch (err: any) {
      setVerifyError(err?.message ?? 'Transaction failed.');
    } finally {
      setVerifyLoading(false);
    }
  };

  if (!wallet.publicKey) {
    return (
      <div className="card p-8 text-center">
        <p className="text-on-surface-variant">Connect your wallet to manage platform settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-outline">Loading platform config…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim px-4 pt-8 pb-12 md:px-6 lg:px-8">
    <div className="mx-auto w-full max-w-7xl">
      <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface italic mb-1">
        Platform setup
      </h1>
      <p className="text-outline font-medium">
        Configure global settings and allowed collateral mints. Only the platform authority can change these.
      </p>

      <div className="mt-8 space-y-8">
        {/* Global config */}
        <section className="card p-6">
          <h2 className="text-lg font-bold text-on-surface">Global config</h2>
          {config ? (
            <>
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="text-outline">Primary authority</dt>
                  <dd className="font-mono text-on-surface break-all">{config.authority}</dd>
                </div>
                <div>
                  <dt className="text-outline">Secondary authority</dt>
                  <dd className="font-mono text-on-surface break-all">
                    {config.secondaryAuthority || <span className="italic text-outline">not set</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-outline">Platform fee (bps)</dt>
                  <dd>{config.platformFeeBps}</dd>
                </div>
                <div>
                  <dt className="text-outline">Platform treasury (wallet)</dt>
                  <dd className="font-mono text-on-surface break-all">{config.platformTreasury}</dd>
                </div>
                <div>
                  <dt className="text-outline">Flat fee per transaction</dt>
                  <dd>{config.platformFeeLamports.toLocaleString()} lamports (~${(config.platformFeeLamports / 1e9 * 140).toFixed(4)} at $140/SOL)</dd>
                </div>
              </dl>
              {isAuthority && (
                <form onSubmit={handleUpdateConfig} className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-on-surface">Secondary authority</label>
                    <input
                      type="text"
                      value={secondaryAuthority}
                      onChange={(e) => setSecondaryAuthority(e.target.value)}
                      placeholder="Leave blank to remove"
                      className="input mt-1 font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-outline">Backup wallet that can manage the platform. Leave blank to disable.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface">Platform fee (basis points)</label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={platformFeeBps}
                      onChange={(e) => setPlatformFeeBps(Number(e.target.value))}
                      className="input mt-1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface">Platform treasury (wallet address)</label>
                    <input
                      type="text"
                      value={platformTreasury}
                      onChange={(e) => setPlatformTreasury(e.target.value)}
                      placeholder="Wallet pubkey that receives fees"
                      className="input mt-1 font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-outline">Token ATAs are created automatically per collateral mint. SOL fees go directly to this wallet.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface">Flat SOL fee per transaction (lamports)</label>
                    <input
                      type="number"
                      min={0}
                      value={platformFeeLamports}
                      onChange={(e) => setPlatformFeeLamports(Number(e.target.value))}
                      className="input mt-1"
                    />
                    <p className="mt-1 text-xs text-outline">
                      Charged in SOL on every mint/redeem. 357 000 ≈ $0.05 at $140/SOL.
                      Current value: ~${(platformFeeLamports / 1e9 * 140).toFixed(4)}
                    </p>
                  </div>
                  {updateError && (
                    <p className="text-sm text-error">{updateError}</p>
                  )}
                  <button type="submit" disabled={updateLoading} className="btn-primary">
                    {updateLoading ? 'Updating…' : 'Update config'}
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-on-surface-variant">Config not initialized yet. Initialize it with your wallet as authority.</p>
              <form onSubmit={handleInitConfig} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface">Secondary authority (optional)</label>
                  <input
                    type="text"
                    value={secondaryAuthority}
                    onChange={(e) => setSecondaryAuthority(e.target.value)}
                    placeholder="Leave blank to skip"
                    className="input mt-1 font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-outline">Backup wallet with the same permissions as the primary authority.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface">Platform fee (basis points)</label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={platformFeeBps}
                    onChange={(e) => setPlatformFeeBps(Number(e.target.value))}
                    className="input mt-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface">Platform treasury (wallet address)</label>
                  <input
                    type="text"
                    value={platformTreasury}
                    onChange={(e) => setPlatformTreasury(e.target.value)}
                    placeholder="Wallet pubkey that receives fees"
                    className="input mt-1 font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-outline">Token ATAs are created automatically per collateral mint. SOL fees go directly to this wallet.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface">Flat SOL fee per transaction (lamports)</label>
                  <input
                    type="number"
                    min={0}
                    value={platformFeeLamports}
                    onChange={(e) => setPlatformFeeLamports(Number(e.target.value))}
                    className="input mt-1"
                  />
                  <p className="mt-1 text-xs text-outline">
                    Charged in SOL on every mint/redeem. 357 000 ≈ $0.05 at $140/SOL.
                    Current value: ~${(platformFeeLamports / 1e9 * 140).toFixed(4)}
                  </p>
                </div>
                {updateError && (
                  <p className="text-sm text-error">{updateError}</p>
                )}
                <button type="submit" disabled={updateLoading} className="btn-primary">
                  {updateLoading ? 'Initializing…' : 'Initialize config'}
                </button>
              </form>
            </>
          )}
          {config && !isAuthority && (
            <p className="mt-4 text-sm text-outline">Your wallet is not a platform authority. Only the primary or secondary authority can update config.</p>
          )}
        </section>

        {/* Allowed collateral mints — visible to all, editable by authority */}
        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-on-surface">Allowed collateral mints</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Only these mints can be used as collateral for new markets.
              </p>
            </div>
            <button
              onClick={loadAllowedMints}
              disabled={allowedMintsLoading}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              {allowedMintsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {/* Live list */}
          <div className="mt-4">
            {allowedMintsLoading && allowedMints.length === 0 ? (
              <p className="text-sm text-outline">Loading…</p>
            ) : allowedMints.length === 0 ? (
              <p className="text-sm text-outline italic">No mints on the allowlist yet.</p>
            ) : (
              <ul className="space-y-1 rounded-xl bg-surface-container-lowest p-2">
                {allowedMints.map((mint) => (
                  <li key={mint} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors">
                    <span className="font-mono text-xs text-on-surface break-all">{mint}</span>
                    {isAuthority && (
                      <button
                        onClick={() => handleRemoveMint(mint)}
                        disabled={removingMint === mint}
                        className="shrink-0 rounded-lg bg-error/10 border border-error/20 px-2.5 py-1 text-xs font-medium text-error hover:bg-error/20 disabled:opacity-40 transition-colors"
                      >
                        {removingMint === mint ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {removeMintError && (
              <p className="mt-2 text-sm text-error">{removeMintError}</p>
            )}
          </div>

          {/* Add mint — authority only */}
          {isAuthority && (
            <form onSubmit={handleAddMint} className="mt-5 flex gap-2">
              <input
                type="text"
                value={newMint}
                onChange={(e) => setNewMint(e.target.value)}
                placeholder="Paste mint pubkey to add"
                className="input flex-1 font-mono text-sm"
              />
              <button type="submit" disabled={addMintLoading} className="btn-primary shrink-0">
                {addMintLoading ? 'Adding…' : 'Add mint'}
              </button>
            </form>
          )}
          {addMintError && (
            <p className="mt-2 text-sm text-error">{addMintError}</p>
          )}
        </section>

        {/* Treasury ATA lookup — visible whenever config exists */}
        {config && (
          <section className="card p-6">
            <h2 className="text-lg font-bold text-on-surface">Treasury ATA lookup</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Check which token account the platform treasury will receive fees into for a given
              collateral mint. The ATA is created automatically on the first transaction if it
              doesn't exist yet.
            </p>
            <form onSubmit={handleAtaLookup} className="mt-4 flex gap-2">
              <input
                type="text"
                value={ataLookupMint}
                onChange={(e) => { setAtaLookupMint(e.target.value); setAtaLookupResult(null); }}
                placeholder="Collateral mint pubkey"
                className="input flex-1 font-mono text-sm"
              />
              <button
                type="submit"
                disabled={ataLookupLoading || !config.platformTreasury}
                className="btn-primary shrink-0"
              >
                {ataLookupLoading ? 'Checking…' : 'Check ATA'}
              </button>
            </form>
            {ataLookupError && (
              <p className="mt-2 text-sm text-error">{ataLookupError}</p>
            )}
            {ataLookupResult && (
              <div className={`mt-3 rounded-xl p-4 text-sm border ${ataLookupResult.exists ? 'bg-secondary/10 border-secondary/20' : 'bg-tertiary/10 border-tertiary/20'}`}>
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined text-[16px] ${ataLookupResult.exists ? 'text-secondary' : 'text-tertiary'}`}>
                    {ataLookupResult.exists ? 'check_circle' : 'warning'}
                  </span>
                  <span className={`font-semibold ${ataLookupResult.exists ? 'text-secondary' : 'text-tertiary'}`}>
                    {ataLookupResult.exists ? 'ATA exists' : 'ATA not yet created'}
                  </span>
                  {!ataLookupResult.exists && (
                    <span className="text-tertiary/70 text-xs">(created automatically on first mint)</span>
                  )}
                </div>
                <p className="mt-2 font-mono text-xs text-on-surface-variant break-all">{ataLookupResult.ata}</p>
              </div>
            )}
          </section>
        )}

        {/* User verification — authority only */}
        {isAuthority && (
          <section className="card p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-on-surface">User verification</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Look up a wallet's profile and grant or revoke the verified badge.
                The wallet must have created a profile first via the Settings page.
              </p>
            </div>

            <form onSubmit={handleVerifyLookup} className="flex gap-2">
              <input
                type="text"
                value={verifyTarget}
                onChange={(e) => {
                  setVerifyTarget(e.target.value);
                  setVerifyTargetProfile('not-found');
                  setVerifyError(null);
                  setVerifySuccess(null);
                }}
                placeholder="Wallet pubkey to look up"
                className="input flex-1 font-mono text-sm"
              />
              <button
                type="submit"
                disabled={verifyTargetLoading || !verifyTarget.trim()}
                className="btn-secondary shrink-0"
              >
                {verifyTargetLoading ? 'Looking up…' : 'Look up'}
              </button>
            </form>

            {verifyError && (
              <div className="flex items-start gap-2 rounded-xl bg-error/10 border border-error/20 p-4">
                <span className="material-symbols-outlined text-error text-[16px] mt-0.5">error</span>
                <p className="text-sm text-error">{verifyError}</p>
              </div>
            )}

            {verifySuccess && (
              <div className="flex items-start gap-2 rounded-xl bg-secondary/10 border border-secondary/20 p-4">
                <span className="material-symbols-outlined text-secondary text-[16px] mt-0.5">check_circle</span>
                <p className="text-sm text-secondary">{verifySuccess}</p>
              </div>
            )}

            {verifyTargetProfile === null && (
              <div className="rounded-xl bg-tertiary/10 border border-tertiary/20 p-4 text-sm text-tertiary">
                No profile found for this wallet. The user must create one first via <strong>/settings</strong>.
              </div>
            )}

            {verifyTargetProfile && verifyTargetProfile !== 'not-found' && (
              <div className="rounded-xl bg-surface-container-low border border-outline-variant/15 p-4 space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-outline">Display name:</span>
                    <span className="text-sm font-bold text-on-surface">
                      {verifyTargetProfile.displayName || <em className="text-outline font-normal">not set</em>}
                    </span>
                  </div>
                  {verifyTargetProfile.url && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-outline">URL:</span>
                      <a href={verifyTargetProfile.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate max-w-xs">
                        {verifyTargetProfile.url}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-outline">Verified:</span>
                    {verifyTargetProfile.verified ? (
                      <span className="flex items-center gap-1 text-sm font-bold text-secondary">
                        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                        Yes
                      </span>
                    ) : (
                      <span className="text-sm text-outline">No</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  {!verifyTargetProfile.verified ? (
                    <button
                      type="button"
                      disabled={verifyLoading}
                      onClick={() => handleSetVerified(true)}
                      className="btn-primary text-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      {verifyLoading && <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>}
                      Grant verified badge
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={verifyLoading}
                      onClick={() => handleSetVerified(false)}
                      className="px-4 py-2 rounded-lg border border-error/30 text-error text-sm font-bold hover:bg-error/10 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {verifyLoading && <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>}
                      Revoke verified badge
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

      </div>
    </div>
    </div>
  );
}
