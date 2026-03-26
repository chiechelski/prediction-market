import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { fetchIdl, PROGRAM_ID } from '@/lib/program';
import { deriveGlobalConfig } from '@/lib/pda';

const DEFAULT_PUBKEY = '11111111111111111111111111111111';

/**
 * Whether the connected wallet may open /platform: primary or secondary authority,
 * or global config not yet created (bootstrap initializeConfig).
 */
export function usePlatformAccess() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(true);
  const [canAccessPlatform, setCanAccessPlatform] = useState(false);

  useEffect(() => {
    if (!wallet.publicKey) {
      setLoading(false);
      setCanAccessPlatform(false);
      return;
    }

    let cancelled = false;
    const globalConfigPda = deriveGlobalConfig(PROGRAM_ID);

    (async () => {
      setLoading(true);
      setCanAccessPlatform(false);
      try {
        const info = await connection.getAccountInfo(globalConfigPda);
        if (cancelled) return;
        if (!info) {
          setCanAccessPlatform(true);
          setLoading(false);
          return;
        }
        const idl = await fetchIdl();
        const provider = new AnchorProvider(connection, wallet as any, {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed',
        });
        const program = new Program(idl, provider);
        const account = await (program.account as any).globalConfig.fetch(
          globalConfigPda
        );
        if (cancelled) return;
        const walletAddr = wallet.publicKey!.toBase58();
        const secAuth = (account.secondaryAuthority as PublicKey).toBase58();
        const isPrimary = account.authority.toBase58() === walletAddr;
        const isSecondary =
          secAuth !== DEFAULT_PUBKEY && secAuth === walletAddr;
        setCanAccessPlatform(isPrimary || isSecondary);
      } catch {
        if (!cancelled) setCanAccessPlatform(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, wallet.publicKey?.toBase58()]);

  return { loading, canAccessPlatform };
}
