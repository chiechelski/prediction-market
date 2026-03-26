import { useMemo } from 'react';
import {
  ConnectionProvider as SolanaConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { useNetwork } from '@/context/NetworkContext';

import '@solana/wallet-adapter-react-ui/styles.css';

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const { network } = useNetwork();
  const endpoint = import.meta.env.VITE_RPC_ENDPOINT ?? network.endpoint;

  return (
    <SolanaConnectionProvider endpoint={endpoint}>{children}</SolanaConnectionProvider>
  );
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <SolanaWalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>{children}</WalletModalProvider>
    </SolanaWalletProvider>
  );
}
