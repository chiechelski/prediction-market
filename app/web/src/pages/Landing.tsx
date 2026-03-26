import { useNavigate } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function Landing() {
  const navigate = useNavigate(); // used in bento grid tiles

  return (
    <div className="bg-background">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div className="absolute inset-0 hero-glow -z-10" />
        <div className="max-w-7xl mx-auto px-8 text-center">

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20 mb-8">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            <span className="text-[10px] font-label uppercase tracking-widest text-secondary font-bold">
              Built on Solana
            </span>
          </div>

          <h1 className="font-headline text-6xl md:text-8xl font-extrabold tracking-tighter text-on-surface mb-6 leading-[0.9]">
            THE FUTURE IS <br />
            <span className="brand-gradient-text">PREDICTABLE.</span>
          </h1>

          <p className="max-w-2xl mx-auto text-outline text-lg md:text-xl font-light mb-12 leading-relaxed">
            Access high-fidelity forecasting markets powered by Solana's sovereign speed.
            Trade on global events with institutional precision and algorithmic trust.
          </p>

          <div className="flex items-center justify-center">
            <WalletMultiButton className="!bg-gradient-to-br !from-primary !to-primary-container !text-on-primary !px-10 !py-5 !rounded-xl !text-lg !font-bold !shadow-2xl !shadow-primary/20 hover:!scale-[1.02] !transition-transform" />
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────── */}
      <section className="py-16 bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

            <div className="p-8 rounded-2xl bg-surface-container border border-outline-variant/5">
              <p className="font-label text-xs uppercase tracking-widest text-outline mb-2">
                Total Volume
              </p>
              <h3 className="font-headline text-4xl font-bold text-on-surface">
                $482,901,234
              </h3>
              <div className="mt-4 flex items-center gap-2 text-secondary text-sm font-bold">
                <span className="material-symbols-outlined text-base">trending_up</span>
                <span>+12.4% 24h</span>
              </div>
            </div>

            <div className="p-8 rounded-2xl bg-surface-container border border-outline-variant/5">
              <p className="font-label text-xs uppercase tracking-widest text-outline mb-2">
                Active Markets
              </p>
              <h3 className="font-headline text-4xl font-bold text-on-surface">1,248</h3>
              <div className="mt-4 flex items-center gap-2 text-primary text-sm font-bold">
                <span className="material-symbols-outlined text-base">public</span>
                <span>Global Markets</span>
              </div>
            </div>

            <div className="p-8 rounded-2xl bg-surface-container border border-outline-variant/5">
              <p className="font-label text-xs uppercase tracking-widest text-outline mb-2">
                TVL
              </p>
              <h3 className="font-headline text-4xl font-bold text-on-surface">$1.2M+</h3>
              <div className="mt-4 flex items-center gap-2 text-tertiary text-sm font-bold">
                <span className="material-symbols-outlined text-base">lock</span>
                <span>Secured on Chain</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Feature Bento Grid ────────────────────────────────────────── */}
      <section className="py-32 px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-auto md:h-[600px]">

          {/* Platform — large tile */}
          <div className="md:col-span-8 rounded-3xl bg-surface-container overflow-hidden relative group p-10 flex flex-col justify-end border border-outline-variant/10">
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 transition-all duration-700 group-hover:from-primary/10 group-hover:to-secondary/10" />
            <div className="relative">
              <span className="material-symbols-outlined text-4xl text-primary mb-6 block">layers</span>
              <h2 className="font-headline text-4xl font-bold mb-4 text-on-surface">The Platform</h2>
              <p className="text-outline max-w-md">
                Our high-performance engine ensures sub-second trade execution with minimal
                slippage, powered by Solana's parallel processing architecture.
              </p>
            </div>
          </div>

          {/* Create tile */}
          <div
            onClick={() => navigate('/create')}
            className="md:col-span-4 rounded-3xl bg-surface-container-low p-10 border border-outline-variant/10 hover:border-primary/30 transition-all flex flex-col group cursor-pointer"
          >
            <span className="material-symbols-outlined text-4xl text-tertiary mb-6 group-hover:rotate-12 transition-transform">
              add_circle
            </span>
            <h2 className="font-headline text-3xl font-bold mb-4 text-on-surface">Create</h2>
            <p className="text-outline text-sm leading-relaxed mb-auto">
              Permissionless market creation. Define your event, set parameters, and let the
              oracle handle the resolution.
            </p>
            <div className="mt-8 flex items-center text-primary font-bold group-hover:translate-x-2 transition-transform">
              Launch Market
              <span className="material-symbols-outlined ml-2">arrow_forward</span>
            </div>
          </div>

          {/* Trade tile */}
          <div
            onClick={() => navigate('/markets')}
            className="md:col-span-4 rounded-3xl bg-surface-container-low p-10 border border-outline-variant/10 hover:border-secondary/30 transition-all flex flex-col group cursor-pointer"
          >
            <span className="material-symbols-outlined text-4xl text-secondary mb-6 group-hover:scale-110 transition-transform">
              swap_horiz
            </span>
            <h2 className="font-headline text-3xl font-bold mb-4 text-on-surface">Trade</h2>
            <p className="text-outline text-sm leading-relaxed mb-auto">
              Trade positions with atomic precision. Hedging, speculation, or sentiment
              analysis — all in one place.
            </p>
            <div className="mt-8 flex items-center text-secondary font-bold group-hover:translate-x-2 transition-transform">
              Enter Terminal
              <span className="material-symbols-outlined ml-2">arrow_forward</span>
            </div>
          </div>

          {/* Resolve tile */}
          <div className="md:col-span-8 rounded-3xl glass-panel p-10 flex items-center gap-10 border border-outline-variant/20">
            <div className="flex-shrink-0 w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
              <span
                className="material-symbols-outlined text-5xl text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                gavel
              </span>
            </div>
            <div>
              <h2 className="font-headline text-3xl font-bold mb-4 text-on-surface">
                Decentralized Resolution
              </h2>
              <p className="text-outline text-sm leading-relaxed">
                Our multi-tiered oracle network ensures every market resolves with absolute
                integrity. No central authority, just truth verified on-chain.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <section className="py-24 px-8 text-center max-w-4xl mx-auto">
        <h2 className="font-headline text-5xl font-bold mb-8 text-on-surface">
          Ready to forecast?
        </h2>
        <div className="p-[1px] rounded-2xl bg-gradient-to-r from-primary via-secondary to-primary">
          <div className="bg-surface-container rounded-2xl p-12">
            <p className="text-xl text-outline mb-10">
              Join 50k+ traders building the world's most accurate prediction engine.
            </p>
            <WalletMultiButton className="!bg-primary !text-on-primary !px-12 !py-4 !rounded-xl !text-lg !font-black hover:!shadow-xl hover:!shadow-primary/30 !transition-all" />
          </div>
        </div>
      </section>

    </div>
  );
}
