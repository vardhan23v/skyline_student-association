import { useRef, type KeyboardEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarDays, HandCoins, LayoutDashboard, Megaphone, QrCode, Shirt, ShoppingBag, Users, Wallet, type LucideIcon } from 'lucide-react';

export type AdminSection = { key: string; to: string; label: string; icon: LucideIcon };

/** Every Control Room section and its URL. Overview is `/admin` itself; the rest are real paths (Back and Forward work). */
export const ADMIN_SECTIONS = [
  { key: 'overview', to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { key: 'events', to: '/admin/events', label: 'Events', icon: CalendarDays },
  { key: 'fundraisers', to: '/admin/fundraisers', label: 'Fundraisers', icon: HandCoins },
  { key: 'checkin', to: '/admin/checkin', label: 'Check-in', icon: QrCode },
  { key: 'members', to: '/admin/members', label: 'Members', icon: Users },
  { key: 'orders', to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { key: 'products', to: '/admin/products', label: 'Products', icon: Shirt },
  { key: 'announcements', to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { key: 'finance', to: '/admin/finance', label: 'Finance', icon: Wallet },
] as const satisfies readonly AdminSection[];

/**
 * Old links were `/admin?tab=<key>` (plus `event=<id>` for an event report). Returns the path that replaced one, keeping
 * the section's own params (e.g. `view=dues`), or null when the URL has no `tab`.
 */
export function legacyAdminPath(search: string): string | null {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (tab === null) return null;
  params.delete('tab');
  const section = ADMIN_SECTIONS.find((s) => s.key === tab);
  let path: string = section?.to ?? '/admin';
  const event = params.get('event');
  if (tab === 'events' && event && /^\d+$/.test(event)) { path = `/admin/events/${event}`; params.delete('event'); }
  const rest = section ? params.toString() : '';
  return rest ? `${path}?${rest}` : path;
}

/**
 * The Control Room's section list, as links. `collapsed` shows the icon rail (labels stay for screen readers and in
 * the tooltip); `onNavigate` lets the phone drawer close after a pick. Up and Down arrows move between items.
 */
export function AdminTabs({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    refs.current[(i + d + ADMIN_SECTIONS.length) % ADMIN_SECTIONS.length]?.focus();
  };
  return (
    <ul className="flex flex-col gap-1">
      {ADMIN_SECTIONS.map((s, i) => (
        <li key={s.key}>
          <NavLink ref={(el) => { refs.current[i] = el; }} to={s.to} end={s.key === 'overview'} onClick={onNavigate} onKeyDown={(e) => onKey(e, i)}
            title={collapsed ? s.label : undefined}
            className={({ isActive }) => `t-nav interactive relative flex min-h-11 items-center gap-2.5 rounded-xl !text-[0.7rem] focus-ring ${collapsed ? 'justify-center px-0' : 'px-3.5'} ${isActive ? 'bg-cream/10 text-cream' : 'text-cream/70 hover:bg-cream/5 hover:text-cream'}`}>
            {({ isActive }) => <>
              <span className={`absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-accent transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
              <s.icon className={`size-4 shrink-0 ${isActive ? 'text-accent-text' : 'text-cream/60'}`} aria-hidden />
              <span className={collapsed ? 'sr-only' : 'truncate'}>{s.label}</span>
            </>}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
