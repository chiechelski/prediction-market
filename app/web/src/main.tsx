import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { NetworkProvider } from '@/context/NetworkContext';
import { ToastProvider } from '@/context/ToastContext';
import { ConnectionProvider, WalletProvider } from '@/components/WalletContext';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NetworkProvider>
      <ConnectionProvider>
        <WalletProvider>
          <ToastProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ToastProvider>
        </WalletProvider>
      </ConnectionProvider>
    </NetworkProvider>
  </StrictMode>
);
