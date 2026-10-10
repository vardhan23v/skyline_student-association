import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Bell, CalendarDays, ClipboardList, LayoutDashboard, LogOut, Megaphone, Menu, QrCode, Receipt, ShoppingBag, Sparkles, UserRound, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import type { AnyRole } from '@/api/types';
import { Brand } from './Brand';

export type NavItem = { to: string; label: string; icon: LucideIcon; roles?: AnyRole[]; auth?: boolean; badge?: number; end?: boolean };

/** Single source of truth for navigation; both desktop rail and mobile bar read from it. */
export function useNavItems(): NavItem[] {
  const { me, has } = useAuth();
  const items: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, auth: true },
    { to: '/events', label: 'Events', icon: CalendarDays },
    { to: '/volunteer/scan', label: 'Check-in', icon: QrCode, roles: ['volunteer'] },
    { to: '/admin/members', label: 'Members', icon: Users, roles: ['admin', 'treasurer'] },
    { to: '/announcements', label: 'Announcements', icon: Megaphone },
    { to: '/shop', label: 'Merchandise', icon: ShoppingBag },
    { to: '/volunteer/tasks', label: 'Tasks', icon: ClipboardList, roles: ['volunteer', 'treasurer'] },
    { to: '/finance', label: 'Finance', icon: Wallet },
    { to: '/treasurer/expenses', label: 'Reimbursements', icon: Receipt, roles: ['treasurer'] },
    { to: '/me', label: 'My account', icon: UserRound, auth: true },
  ];
  return items.filter((i) => (!i.auth || !!me) && (!i.roles || has(...i.roles)));
}

const Mark = () => <Brand tagline />;

const railLink = ({ isActive }: { isActive: boolean }) =>
  `interactive group relative flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm ${isActive ? 'bg-accent-soft text-text-primary' : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'}`;

/** Desktop rail: translucent glass, blur, hairline border, specular top edge. */
export function SideNav({ onOpenSecretary, attention }: { onOpenSecretary: () => void; attention: number }) {
  const items = useNavItems();
  const { me, logout } = useAuth();
  return (
    <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-60 shrink-0 flex-col rounded-[var(--radius-xl)] border border-border bg-surface p-3 lg:flex" aria-label="Primary">
      <div className="mb-4 px-2 py-2"><Mark /></div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin" aria-label="Sections">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={railLink}>
            {({ isActive }) => (<>
              <span className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
              <i.icon className={`size-4 shrink-0 ${isActive ? 'text-accent' : 'text-text-tertiary group-hover:text-text-secondary'}`} aria-hidden />
              <span className="truncate">{i.label}</span>
              {i.to === '/dashboard' && attention > 0 && <span className="ml-auto badge bg-warning-soft text-warning !px-1.5" aria-label={`${attention} items need attention`}>{attention}</span>}
            </>)}
          </NavLink>
        ))}
      </nav>
      <div className="mt-3 border-t border-border pt-3">
        {me ? (<>
          <button onClick={onOpenSecretary} className="btn-secondary mb-2 w-full !justify-start !px-3"><Sparkles className="size-4 text-accent" aria-hidden />AI Secretary</button>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs text-accent" aria-hidden>{me.user.name.slice(0, 1)}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm">{me.user.name}</div><div className="t-label !text-[10px]">{me.user.role}</div></div>
            <button onClick={logout} aria-label="Log out" title="Log out" className="inline-flex size-9 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-elevated hover:text-text-primary"><LogOut className="size-4" aria-hidden /></button>
          </div>
        </>) : (
          <div className="flex gap-2"><Link to="/login" className="btn-secondary flex-1">Log in</Link><Link to="/register" className="btn-primary flex-1">Join</Link></div>
        )}
      </div>
    </aside>
  );
}

/** Top context bar: page crumb, date, notifications/attention, account. */
export function TopBar({ onOpenSecretary, attention, onOpenMenu }: { onOpenSecretary: () => void; attention: number; onOpenMenu: () => void }) {
  const { me, logout } = useAuth();
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <header className="glass sticky top-0 z-[var(--z-nav)] -mx-4 mb-5 flex items-center gap-2 rounded-none border-x-0 border-t-0 px-4 py-2.5 lg:static lg:mx-0 lg:mb-6 lg:border-0 lg:bg-transparent lg:px-0 lg:shadow-none lg:backdrop-blur-none lg:before:hidden">
      <button onClick={onOpenMenu} aria-label="Open menu" className="inline-flex size-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface-elevated lg:hidden"><Menu className="size-5" aria-hidden /></button>
      <span className="lg:hidden"><Mark /></span>
      <span className="hidden t-label lg:inline">{today}</span>
      <div className="ml-auto flex items-center gap-1">
        {me && attention > 0 && (
          <Link to="/dashboard" aria-label={`${attention} items need attention`} className="relative inline-flex size-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface-elevated">
            <Bell className="size-5" aria-hidden /><span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-warning font-mono text-[10px] text-background">{attention > 9 ? '9+' : attention}</span>
          </Link>
        )}
        {me ? (<>
          <button onClick={onOpenSecretary} className="btn-secondary !min-h-11 !px-3 !text-xs lg:hidden"><Sparkles className="size-3.5 text-accent" aria-hidden /><span className="hidden sm:inline">Secretary</span></button>
          <span className="hidden items-center gap-2 pl-2 text-sm text-text-secondary lg:inline-flex">{me.user.name}<span className="badge bg-surface-elevated text-text-secondary">{me.user.role}</span></span>
          <button onClick={logout} className="btn-ghost !min-h-10 !px-3 !text-xs hidden lg:inline-flex">Log out</button>
        </>) : (<><Link to="/login" className="btn-secondary !min-h-10 !px-3 !text-xs">Log in</Link><Link to="/register" className="btn-primary !min-h-10 !px-3 !text-xs">Join</Link></>)}
      </div>
    </header>
  );
}

/** Mobile taskbar: the four most-used destinations plus "More", which opens the full sheet. */
export function BottomBar({ onMore }: { onMore: () => void }) {
  const items = useNavItems();
  const primary = items.slice(0, 4);
  return (
    <nav aria-label="Primary" className="glass fixed inset-x-3 bottom-3 z-[var(--z-nav)] grid grid-cols-5 rounded-[var(--radius-xl)] p-1 lg:hidden safe-bottom">
      {primary.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `interactive flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-lg)] text-[10px] font-medium ${isActive ? 'text-accent bg-accent-soft' : 'text-text-secondary'}`}>
          <i.icon className="size-5" aria-hidden /><span className="truncate max-w-full px-1">{i.label}</span>
        </NavLink>
      ))}
      <button onClick={onMore} className="interactive flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-lg)] text-[10px] font-medium text-text-secondary"><Menu className="size-5" aria-hidden />More</button>
    </nav>
  );
}

/** Full navigation sheet for phones/tablets. Closes on route change and Escape. */
export function MenuSheet({ open, onClose, onOpenSecretary }: { open: boolean; onClose: () => void; onOpenSecretary: () => void }) {
  const items = useNavItems();
  const { me, logout } = useAuth();
  const loc = useLocation();
  const [path, setPath] = useState(loc.pathname);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => { if (loc.pathname !== path) { setPath(loc.pathname); onClose(); } }, [loc.pathname, path, onClose]);
  // aria-modal dialog: move focus in on open, keep Tab inside, hand focus back to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    const focusables = () => [...(sheet.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? [])];
    focusables()[0]?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab') return;
      const items = focusables(); if (!items.length) return;
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); restore?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[var(--z-drawer)] bg-black/60 fade-in lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} role="dialog" aria-modal="true" aria-label="Menu" className="glass absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col rounded-r-[var(--radius-xl)] p-4 slide-in-right" style={{ animationName: 'fadeIn' }}>
        <div className="mb-4 flex items-center justify-between"><Mark /><button aria-label="Close menu" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface-elevated"><X className="size-5" aria-hidden /></button></div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label="All sections">
          {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={railLink}>{({ isActive }) => (<><i.icon className={`size-4 ${isActive ? 'text-accent' : 'text-text-tertiary'}`} aria-hidden />{i.label}</>)}</NavLink>)}
        </nav>
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {me ? (<>
            <button onClick={() => { onClose(); onOpenSecretary(); }} className="btn-secondary w-full !justify-start !px-3"><Sparkles className="size-4 text-accent" aria-hidden />AI Secretary</button>
            <button onClick={logout} className="btn-ghost w-full !justify-start !px-3"><LogOut className="size-4" aria-hidden />Log out · {me.user.name}</button>
          </>) : (<div className="flex gap-2"><Link to="/login" className="btn-secondary flex-1">Log in</Link><Link to="/register" className="btn-primary flex-1">Join</Link></div>)}
        </div>
      </div>
    </div>
  );
}
