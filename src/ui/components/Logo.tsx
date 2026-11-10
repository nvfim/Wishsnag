import { useId } from 'react';

/**
 * WishSnag mark: a shopping bag holding a heart ("something you want"), with a mint
 * spark for "caught the deal". The spark is dropped at small sizes for legibility.
 */
export function LogoMark({ size = 32, spark = size >= 28, className }: { size?: number; spark?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} role="img" aria-label="WishSnag">
      <defs>
        <linearGradient id={`${id}-bg`} x1="10" y1="6" x2="122" y2="124" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8B6CFF" />
          <stop offset="0.55" stopColor="#6A45F0" />
          <stop offset="1" stopColor="#E8336C" />
        </linearGradient>
        <linearGradient id={`${id}-heart`} x1="44" y1="56" x2="86" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6A45F0" />
          <stop offset="1" stopColor="#E8336C" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="120" height="120" rx="32" fill={`url(#${id}-bg)`} />
      <path d="M47 52V41a17 17 0 0 1 34 0v11" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
      <path d="M34 47h60a4.5 4.5 0 0 1 4.5 4.8l-3.6 48.6a7 7 0 0 1-7 6.5H40.1a7 7 0 0 1-7-6.5l-3.6-48.6A4.5 4.5 0 0 1 34 47Z" fill="#fff" />
      <path d="M64 95s-20-11.6-20-25.2c0-6.8 5.1-11.6 11-11.6 4 0 7.2 2.1 9 5.3 1.8-3.2 5-5.3 9-5.3 5.9 0 11 4.8 11 11.6C84 83.4 64 95 64 95Z" fill={`url(#${id}-heart)`} />
      {spark && <path d="M101 14.5l3.2 9.3 9.3 3.2-9.3 3.2-3.2 9.3-3.2-9.3-9.3-3.2 9.3-3.2Z" fill="#3EDCA6" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />}
    </svg>
  );
}

export function Logo({ size = 28, showTagline = false, tagline = 'Wishlist it. Wait for it. Snag it.' }: { size?: number; showTagline?: boolean; tagline?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="text-left leading-none">
        <div className="font-display text-[1.15em] font-extrabold tracking-tight text-fg">
          Wish<span className="brand-text">Snag</span>
        </div>
        {showTagline && <div className="mt-1 text-[0.7em] font-medium text-muted">{tagline}</div>}
      </div>
    </div>
  );
}
