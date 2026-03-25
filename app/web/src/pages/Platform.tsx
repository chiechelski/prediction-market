import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { fetchIdl } from '@/lib/program';
import { PROGRAM_ID } from '@/lib/program';
import { deriveGlobalConfig, deriveAllowedMint } from '@/lib/pda';

type ConfigState = {
  authority: string;
  platformFeeBps: number;
  platformTreasury: string;
} | null;

export default function Platform() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [config, setConfig] = useState<ConfigState>(null);
  const [loading, setLoading] = useState(true);

  const [platformFeeBps, setPlatformFeeBps] = useState(100);
  const [platformTreasury, setPlatformTreasury] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [newMint, setNewMint] = useState('');
  const [addMintLoading, setAddMintLoading] = useState(false);
  const [addMintError, setAddMintError] = useState<string | null>(null);

  const [removeMint, setRemoveMint] = useState('');
  const [removeMintLoading, setRemoveMintLoading] = useState(false);
  const [removeMintError, setRemoveMintError] = useState<string | null>(null);

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
          setConfig({
            authority: account.authority.toBase58(),
            platformFeeBps: account.platformFeeBps,
            platformTreasury: account.platformTreasury.toBase58(),
          });
          setPlatformFeeBps(account.platformFeeBps);
          setPlatformTreasury(account.platformTreasury.toBase58());
        }
      } catch {
        if (!cancelled) setConfig(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [connection, wallet.publicKey]);

  const isAuthority = config && wallet.publicKey && config.authority === wallet.publicKey.toBase58();

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
      await program.methods
        .initializeConfig(platformFeeBps, treasuryPubkey)
        .accounts({
          globalConfig: globalConfigPda,
          authority: wallet.publicKey,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
        })
        .rpc({ skipPreflight: false });
      setConfig({
        authority: wallet.publicKey.toBase58(),
        platformFeeBps,
        platformTreasury: treasuryPubkey.toBase58(),
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
      await program.methods
        .updateConfig(platformFeeBps, treasuryPubkey)
        .accounts({
          globalConfig: globalConfigPda,
          authority: wallet.publicKey,
        })
        .rpc({ skipPreflight: false });
      setConfig((c) => c ? { ...c, platformFeeBps, platformTreasury: treasuryPubkey.toBase58() } : null);
    } catch (err: any) {
      setUpdateError(err?.message ?? 'Transaction failed');
    } finally {
      setUpdateLoading(false);
    }
  };

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
    } catch (err: any) {
      setAddMintError(err?.message ?? 'Transaction failed');
    } finally {
      setAddMintLoading(false);
    }
  };

  const handleRemoveMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !removeMint.trim()) return;
    setRemoveMintLoading(true);
    setRemoveMintError(null);
    try {
      const idl = await fetchIdl();
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      });
      const program = new Program(idl, provider);
      const mintPubkey = new PublicKey(removeMint.trim());
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
      setRemoveMint('');
    } catch (err: any) {
      setRemoveMintError(err?.message ?? 'Transaction failed');
    } finally {
      setRemoveMintLoading(false);
    }
  };

  if (!wallet.publicKey) {
    return (
      <div className="card p-8 text-center">
        <p className="text-surface-600">Connect your wallet to manage platform settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-surface-500">Loading platform config…</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-surface-900">
        Platform setup
      </h1>
      <p className="mt-1 text-surface-600">
        Configure global settings and allowed collateral mints. Only the platform authority can change these.
      </p>

      <div className="mt-8 space-y-8">
        {/* Global config */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-surface-900">Global config</h2>
          {config ? (
            <>
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="text-surface-500">Authority</dt>
                  <dd className="font-mono text-surface-900 break-all">{config.authority}</dd>
                </div>
                <div>
                  <dt className="text-surface-500">Platform fee (bps)</dt>
                  <dd>{config.platformFeeBps}</dd>
                </div>
                <div>
                  <dt className="text-surface-500">Platform treasury</dt>
                  <dd className="font-mono text-surface-900 break-all">{config.platformTreasury}</dd>
                </div>
              </dl>
              {isAuthority && (
                <form onSubmit={handleUpdateConfig} className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-700">Platform fee (basis points)</label>
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
                    <label className="block text-sm font-medium text-surface-700">Platform treasury (token account)</label>
                    <input
                      type="text"
                      value={platformTreasury}
                      onChange={(e) => setPlatformTreasury(e.target.value)}
                      placeholder="Pubkey of the token account that receives fees"
                      className="input mt-1"
                    />
                  </div>
                  {updateError && (
                    <p className="text-sm text-red-600">{updateError}</p>
                  )}
                  <button type="submit" disabled={updateLoading} className="btn-primary">
                    {updateLoading ? 'Updating…' : 'Update config'}
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-surface-600">Config not initialized yet. Initialize it with your wallet as authority.</p>
              <form onSubmit={handleInitConfig} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700">Platform fee (basis points)</label>
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
                  <label className="block text-sm font-medium text-surface-700">Platform treasury (token account pubkey)</label>
                  <input
                    type="text"
                    value={platformTreasury}
                    onChange={(e) => setPlatformTreasury(e.target.value)}
                    placeholder="e.g. ATA that will receive platform fees"
                    className="input mt-1"
                  />
                </div>
                {updateError && (
                  <p className="text-sm text-red-600">{updateError}</p>
                )}
                <button type="submit" disabled={updateLoading} className="btn-primary">
                  {updateLoading ? 'Initializing…' : 'Initialize config'}
                </button>
              </form>
            </>
          )}
          {config && !isAuthority && (
            <p className="mt-4 text-sm text-surface-500">Your wallet is not the platform authority. Only the authority can update config.</p>
          )}
        </section>

        {/* Allowed collateral mints */}
        {isAuthority && (
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-surface-900">Allowed collateral mints</h2>
            <p className="mt-1 text-sm text-surface-600">Only these mints can be used as collateral for new markets.</p>
            <form onSubmit={handleAddMint} className="mt-4 flex gap-2">
              <input
                type="text"
                value={newMint}
                onChange={(e) => setNewMint(e.target.value)}
                placeholder="Mint pubkey (e.g. USDC)"
                className="input flex-1"
              />
              <button type="submit" disabled={addMintLoading} className="btn-primary shrink-0">
                {addMintLoading ? 'Adding…' : 'Add mint'}
              </button>
            </form>
            {addMintError && (
              <p className="mt-2 text-sm text-red-600">{addMintError}</p>
            )}
            <h3 className="mt-8 text-sm font-semibold text-surface-900">
              Remove allowed mint
            </h3>
            <p className="mt-1 text-sm text-surface-600">
              Closes the allowlist PDA for a mint. New markets using that
              collateral will fail until the mint is added again.
            </p>
            <form onSubmit={handleRemoveMint} className="mt-4 flex gap-2">
              <input
                type="text"
                value={removeMint}
                onChange={(e) => setRemoveMint(e.target.value)}
                placeholder="Mint pubkey to remove"
                className="input flex-1"
              />
              <button
                type="submit"
                disabled={removeMintLoading}
                className="rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-surface-800 hover:bg-surface-50 shrink-0"
              >
                {removeMintLoading ? 'Removing…' : 'Remove'}
              </button>
            </form>
            {removeMintError && (
              <p className="mt-2 text-sm text-red-600">{removeMintError}</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
