import { Link } from 'react-router-dom';

/** Brand lockup: skyline bars + wordmark + tagline. One place, used by every nav. */
export function Brand({ to = '/', tagline = false, className = '' }: { to?: string; tagline?: boolean; className?: string }) {
  return (
    <Link to={to} className={`focus-ring inline-flex items-center gap-2.5 rounded-md ${className}`}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden><rect width="32" height="32" rx="6" fill="var(--surface-sunken)" stroke="var(--border)" /><g fill="var(--accent)"><rect x="6" y="17" width="4" height="9" /><rect x="12" y="11" width="4" height="15" /><rect x="18" y="6" width="4" height="20" /><rect x="24" y="14" width="3" height="12" /></g><rect x="5" y="27" width="22" height="1.5" fill="var(--text-primary)" /></svg>
      <span className="leading-none">
        <span className="block font-display text-[15px] font-bold tracking-tight">Skyline SA</span>
        {tagline && <span className="mt-0.5 block t-label !text-[9px]">Beyond the Bell.</span>}
      </span>
    </Link>
  );
}
