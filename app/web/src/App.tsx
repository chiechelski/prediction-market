import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import Layout from '@/components/Layout';
import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
import CreateMarket from '@/pages/CreateMarket';
import MarketDetail from '@/pages/MarketDetail';
import MarketInfo from '@/pages/MarketInfo';
import Platform from '@/pages/Platform';
import Docs from '@/pages/Docs';
import Settings from '@/pages/Settings';
import { usePlatformAccess } from '@/hooks/usePlatformAccess';

function PlatformRoute() {
  const { loading, canAccessPlatform } = usePlatformAccess();
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-outline">Loading…</p>
      </div>
    );
  }
  if (!canAccessPlatform) {
    return <Navigate to="/markets" replace />;
  }
  return <Platform />;
}

function CreatorMarketsRoute() {
  const { creatorPubkey } = useParams<{ creatorPubkey: string }>();
  let ok = false;
  try {
    if (creatorPubkey) new PublicKey(creatorPubkey);
    ok = Boolean(creatorPubkey);
  } catch {
    ok = false;
  }
  if (!ok) return <Navigate to="/markets" replace />;
  return <Dashboard tab="markets" creatorPubkey={creatorPubkey!} />;
}

export default function App() {
  const { connected } = useWallet();

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={connected ? <Navigate to="/markets" replace /> : <Landing />} />
        <Route path="markets" element={connected ? <Dashboard tab="markets" /> : <Navigate to="/" replace />} />
        <Route
          path="markets/creator/:creatorPubkey"
          element={connected ? <CreatorMarketsRoute /> : <Navigate to="/" replace />}
        />
        <Route path="creator" element={connected ? <Dashboard tab="creator" /> : <Navigate to="/" replace />} />
        <Route path="judges" element={connected ? <Dashboard tab="judges" /> : <Navigate to="/" replace />} />
        <Route path="create" element={connected ? <CreateMarket /> : <Navigate to="/" replace />} />
        <Route path="platform" element={connected ? <PlatformRoute /> : <Navigate to="/" replace />} />
        <Route path="settings" element={connected ? <Settings /> : <Navigate to="/" replace />} />
        <Route path="docs" element={<Docs />} />
        <Route path="market/:marketKey/info" element={connected ? <MarketInfo /> : <Navigate to="/" replace />} />
        <Route path="market/:marketKey" element={connected ? <MarketDetail /> : <Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
