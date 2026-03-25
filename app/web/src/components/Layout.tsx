import { Outlet } from 'react-router-dom';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const nav = [
  { to: '/markets', label: 'Markets' },
  { to: '/creator', label: 'Creator' },
  { to: '/judges', label: 'Judges' },
  { to: '/create', label: 'Create market' },
  { to: '/platform', label: 'Platform' },
  { to: '/docs', label: 'Docs' },
];

export default function Layout() {
  const location = useLocation();
  const { connected } = useWallet();

  return (
    <div className="min-h-screen flex flex-col bg-surface-50">
      <header className="sticky top-0 z-50 border-b border-surface-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-semibold tracking-tight text-surface-900">
              Prediction Market
            </span>
          </Link>
          <nav className="flex items-center gap-1">
              {(connected ? nav : nav.filter(({ to }) => to === '/docs')).map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    location.pathname === to
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          <div className="flex items-center gap-3">
            <WalletMultiButton className="!btn !btn-primary !h-10 !rounded-lg" />
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
