import { inferMarketSectorSlug, type MarketSectorSlug } from '@/lib/marketDiscovery';

/** AI-generated wide headers served from `public/market-headers/`. */
const SECTOR_IMAGES: Record<MarketSectorSlug, string> = {
  sports: '/market-headers/sports.png',
  crypto: '/market-headers/crypto.png',
  politics: '/market-headers/politics.png',
  economics: '/market-headers/economics.png',
};

const DEFAULT_IMAGE = '/market-headers/general.png';

const SECTOR_LABELS: Record<MarketSectorSlug, string> = {
  sports: 'Sports',
  crypto: 'Crypto',
  politics: 'Politics',
  economics: 'Economics',
};

export type MarketSectorBannerProps = {
  category?: string;
  className?: string;
  /** Taller hero (detail page) vs slim strip (list cards). */
  variant?: 'card' | 'hero';
  /** Show a small sector label on the left (list cards). */
  showLabel?: boolean;
};

export default function MarketSectorBanner({
  category,
  className = '',
  variant = 'card',
  showLabel = true,
}: MarketSectorBannerProps) {
  const slug = inferMarketSectorSlug(category);
  const imageSrc = slug ? SECTOR_IMAGES[slug] : DEFAULT_IMAGE;
  const label = slug ? SECTOR_LABELS[slug] : 'Market';
  const h = variant === 'hero' ? 'min-h-[140px] sm:min-h-[160px]' : 'min-h-[72px]';

  return (
    <div className={`relative overflow-hidden ${h} ${className}`} aria-hidden>
      <img
        src={imageSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/45" />
      {variant === 'card' && (
        <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2240%22%20height=%2240%22%3E%3Cpath%20d=%22M0%2040h40M40%200v40%22%20stroke=%22%23fff%22%20stroke-width=%221%22/%3E%3C/svg%3E')]" />
      )}
      {showLabel && (
        <div className="absolute bottom-2 left-3 right-3 z-[1] flex items-end justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80 drop-shadow-md">
            {label}
          </span>
          {category?.trim() && slug === null && (
            <span className="max-w-[60%] truncate text-[10px] font-semibold text-white/90 drop-shadow-md">
              {category.trim()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
