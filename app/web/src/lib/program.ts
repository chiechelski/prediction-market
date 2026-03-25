import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMemo } from 'react';

const PROGRAM_ID = new PublicKey('C5QvWnGHeC6o7N68heWFKPvC35eggZ9Mrgqzj86WwrBv');

let idlCache: any = null;

export async function fetchIdl(): Promise<any> {
  if (idlCache) return idlCache;
  const res = await fetch('/idl/prediction_market.json');
  if (!res.ok) throw new Error('Failed to fetch IDL');
  idlCache = await res.json();
  return idlCache;
}

export function useProgram(connection: Connection) {
  const wallet = useWallet();
  return useMemo(() => {
    if (!wallet.publicKey) return null;
    const provider = new AnchorProvider(connection, wallet as any, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
    return { provider, programId: PROGRAM_ID };
  }, [connection, wallet.publicKey, wallet.signTransaction]);
}

export { PROGRAM_ID };
