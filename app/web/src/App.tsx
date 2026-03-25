import { Routes, Route, Navigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import Layout from '@/components/Layout';
import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
import CreateMarket from '@/pages/CreateMarket';
import MarketDetail from '@/pages/MarketDetail';
import Platform from '@/pages/Platform';
import Docs from '@/pages/Docs';

export default function App() {
  const { connected } = useWallet();

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={connected ? <Navigate to="/markets" replace /> : <Landing />} />
        <Route path="markets" element={connected ? <Dashboard tab="markets" /> : <Navigate to="/" replace />} />
        <Route path="creator" element={connected ? <Dashboard tab="creator" /> : <Navigate to="/" replace />} />
        <Route path="judges" element={connected ? <Dashboard tab="judges" /> : <Navigate to="/" replace />} />
        <Route path="create" element={connected ? <CreateMarket /> : <Navigate to="/" replace />} />
        <Route path="platform" element={connected ? <Platform /> : <Navigate to="/" replace />} />
        <Route path="docs" element={<Docs />} />
        <Route path="market/:marketKey" element={connected ? <MarketDetail /> : <Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
