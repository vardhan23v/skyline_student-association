import { Link } from 'react-router-dom';

/** Brand lockup: club logo + wordmark + tagline. One place, used by every nav. */
export function Brand({ to = '/', tagline = false, className = '' }: { to?: string; tagline?: boolean; className?: string }) {
  return (
    <Link to={to} className={`focus-ring inline-flex items-center gap-2.5 rounded-md ${className}`}>
      <img src="/brand/logo-96.png" srcSet="/brand/logo-96.png 1x, /brand/logo-192.png 2x" width={32} height={32} alt="" className="size-8 shrink-0 object-contain" />
      <span className="leading-none">
        <span className="block font-display text-[15px] font-bold tracking-tight">Skyline SA</span>
        {tagline && <span className="mt-0.5 block t-label !text-[9px]">Beyond the Bell.</span>}
      </span>
    </Link>
  );
}
