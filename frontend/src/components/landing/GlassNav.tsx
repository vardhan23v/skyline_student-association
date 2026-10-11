import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronDown, ExternalLink, LayoutDashboard, LogOut, Menu, UserRound, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { navLinks, type SectionId } from '../../data/landing';
import { lockScroll, scrollToSection } from '../../hooks/useSmoothScroll';
import { SkylineMark } from './SectionHeading';
import { dur } from '../../lib/motion';

/** Route links on every page except the landing page, which keeps its in-page section anchors. */
const appLinks = [
  { to: '/events', label: 'Events' },
  { to: '/shop', label: 'Shop' },
  { to: '/announcements', label: 'News' },
];
/** Inside the Control Room the same three words manage those things instead of showing them (plus an Orders shortcut). */
const adminLinks = [
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/products', label: 'Shop' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/announcements', label: 'News' },
];
const isAdminPath = (p: string) => p === '/admin' || p.startsWith('/admin/');
const menuItem = 'flex min-h-11 items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-cream/10';

/** Signed in: avatar button. Admins: Control Room, View site ↗ (new tab), Log out. Users: My account, Log out. */
function AccountMenu() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!me) return null;
  const admin = me.user.role === 'admin';
  const home = admin ? { to: '/admin', label: 'Control Room', Icon: LayoutDashboard } : { to: '/me', label: 'My account', Icon: UserRound };
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={`Account menu for ${me.user.name}`}
        className="flex min-h-11 items-center gap-1.5 rounded-full border border-cream/15 py-1 pl-1 pr-2.5 text-cream transition-colors hover:border-cream/40">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-cream font-bold text-midnight" aria-hidden>{me.user.name.slice(0, 1).toUpperCase()}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-cream/15 bg-midnight/95 py-1.5 text-cream shadow-xl backdrop-blur-xl">
          <div className="border-b border-cream/10 px-4 pb-2 pt-1.5"><div className="truncate text-sm font-bold">{me.user.name}</div><div className="truncate text-xs text-cream/60">{me.user.email}</div></div>
          <Link role="menuitem" to={home.to} className={menuItem}><home.Icon className="h-4 w-4" aria-hidden />{home.label}</Link>
          {admin && <a role="menuitem" href="/" target="_blank" rel="noopener" className={menuItem}><ExternalLink className="h-4 w-4" aria-hidden />View site ↗<span className="sr-only"> (opens in a new tab)</span></a>}
          <button role="menuitem" type="button" onClick={logout} className={`${menuItem} w-full text-left`}><LogOut className="h-4 w-4" aria-hidden />Log out</button>
        </div>
      )}
    </div>
  );
}

/**
 * Floating glass pill nav, shared by the landing page, every public page, /me and the Control Room.
 * On `/` it shrinks after 80px of scroll and tracks the section in view; elsewhere it links to routes.
 * Control Room (an admin on /admin…): the links manage instead of browse, the logo stays on /admin, "View site ↗" opens
 * the public site in a new tab, and the menu button (below lg) opens the section drawer via `onAdminMenu`. An admin
 * on a public page gets a "Back to Control Room" pill.
 */
export function GlassNav({ onAdminMenu }: { onAdminMenu?: () => void } = {}) {
  const { me, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const onHome = loc.pathname === '/';
  const isAdmin = me?.user.role === 'admin';
  const controlRoom = isAdmin && isAdminPath(loc.pathname) && !!onAdminMenu;
  const links = controlRoom ? adminLinks : appLinks;
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<SectionId | null>(null);
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);
  /** Runs once the sheet's history entry has been popped (see closeMenu). */
  const afterClose = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!onHome) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id as SectionId)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    (['events', 'past', 'merch', 'about', 'gallery', 'join'] as const).forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [onHome]);

  // The open sheet owns one history entry, so the phone's Back gesture closes it instead of leaving the page.
  const openMenu = () => { window.history.pushState({ ...window.history.state, ssaMenu: true }, ''); setOpen(true); };
  const closeMenu = (then?: () => void) => {
    afterClose.current = then ?? null;
    if (window.history.state?.ssaMenu) window.history.back(); // popstate below closes the sheet
    else { setOpen(false); then?.(); }
  };
  useEffect(() => {
    if (!open) return;
    const onPop = () => { setOpen(false); const f = afterClose.current; afterClose.current = null; if (f) requestAnimationFrame(f); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);
  // Leaving md (rotating a tablet) with the sheet open: drop it.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => { if (mq.matches) closeMenu(); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    lockScroll(true);
    firstLink.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeMenu(); return; }
      if (e.key !== 'Tab' || !sheet.current) return;
      // Focus stays inside the sheet while it's open.
      const items = [...sheet.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')];
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { lockScroll(false); window.removeEventListener('keydown', onKey); menuBtn.current?.focus({ preventScroll: true }); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (open) closeMenu(() => scrollToSection(id));
    else requestAnimationFrame(() => scrollToSection(id));
  };
  /** A route link in the sheet replaces the sheet's history entry, so Back from the new page skips it. */
  const goRoute = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    afterClose.current = null;
    setOpen(false);
    nav(to, { replace: !!window.history.state?.ssaMenu });
  };
  // "Past events" has no nav link, so it keeps the Events link lit.
  const isActive = (id: SectionId) => active === id || (id === 'events' && active === 'past');
  const home = me ? (isAdmin ? { to: '/admin', label: 'Control Room' } : { to: '/me', label: 'My account' }) : null;

  return (
    <>
      <header data-theme="dark" className="top-nav-safe fixed inset-x-0 z-50 flex justify-center px-4 md:px-6">
        <nav
          aria-label="Primary"
          className={`flex w-full max-w-5xl items-center justify-between gap-3 rounded-full border border-cream/10 shadow-lg backdrop-blur-xl transition-[background-color,padding] duration-300 ${scrolled ? 'bg-midnight/55 py-1.5 pl-3 pr-1.5 md:px-4 md:py-2' : 'bg-midnight/35 py-2 pl-4 pr-2 md:px-5 md:py-3'}`}
        >
          {onHome ? (
            <a href="#top" onClick={go('top')} className="flex min-h-11 items-center gap-2 rounded-full text-cream">
              <SkylineMark className={`transition-all ${scrolled ? 'h-8 w-8' : 'h-10 w-10'}`} />
              <span className="t-nav font-extrabold">SSA</span>
            </a>
          ) : (
            <Link to={controlRoom ? '/admin' : '/'} className="flex min-h-11 items-center gap-2 rounded-full text-cream">
              <SkylineMark className={`transition-all ${scrolled ? 'h-8 w-8' : 'h-10 w-10'}`} />
              {/* The accessible name starts with the visible "SSA", for voice control. */}
              <span className="t-nav font-extrabold">SSA<span className="sr-only">{controlRoom ? ', Control Room overview' : ' home, Skyline Student Association'}</span></span>
            </Link>
          )}
          <ul className="hidden items-center md:flex lg:gap-1">
            {!onHome && links.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} className={({ isActive }) => `t-nav relative flex min-h-11 items-center px-2.5 transition-colors hover:text-cream lg:px-3 ${isActive ? 'text-cream' : 'text-cream/70'}`}>
                  {({ isActive }) => <>{l.label}<span className={`absolute inset-x-3 bottom-1.5 h-px origin-left bg-cream transition-transform duration-300 ${isActive ? 'scale-x-100' : 'scale-x-0'}`} /></>}
                </NavLink>
              </li>
            ))}
            {onHome && navLinks.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  onClick={go(l.id)}
                  aria-current={isActive(l.id) ? 'true' : undefined}
                  className={`t-nav relative flex min-h-11 items-center px-2.5 transition-colors hover:text-cream lg:px-3 ${isActive(l.id) ? 'text-cream' : 'text-cream/70'}`}
                >
                  {l.label}
                  <span className={`absolute inset-x-3 bottom-1.5 h-px origin-left bg-cream transition-transform duration-300 ${isActive(l.id) ? 'scale-x-100' : 'scale-x-0'}`} />
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            {/* Below md the hamburger is the only control; login, join and the account menu live in the sheet. */}
            {!me && <Link to="/login" className="t-nav hidden min-h-11 items-center rounded-full px-3 text-cream/80 transition-colors hover:text-cream md:flex">Login</Link>}
            {!me && onHome && <a href="#join" onClick={go('join')} data-cursor="button" className="btn-l-primary btn-l-sm !min-h-11 hidden lg:inline-flex">Become a member</a>}
            {!me && !onHome && <Link to="/register" className="btn-l-primary btn-l-sm !min-h-11 hidden md:inline-flex">Join</Link>}
            {controlRoom && <a href="/" target="_blank" rel="noopener" className="t-nav hidden min-h-11 items-center gap-1.5 rounded-full border border-cream/15 px-3.5 text-cream/80 transition-colors hover:border-cream/40 hover:text-cream sm:inline-flex">View site<ExternalLink className="h-3.5 w-3.5" aria-hidden /><span className="sr-only"> (opens in a new tab)</span></a>}
            {isAdmin && !controlRoom && <Link to="/admin" className="t-nav inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-3.5 text-accent-foreground shadow-lg transition-[filter] hover:brightness-110"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /><span className="sm:hidden">Control Room</span><span className="hidden sm:inline">Back to Control Room</span></Link>}
            <div className="hidden md:block"><AccountMenu /></div>
            {controlRoom ? (
              <button type="button" onClick={onAdminMenu} aria-label="Open Control Room menu" aria-haspopup="dialog" className="grid h-11 w-11 place-items-center rounded-full text-cream lg:hidden">
                <Menu className="h-5 w-5" aria-hidden />
              </button>
            ) : (
              <button
                ref={menuBtn}
                type="button"
                onClick={openMenu}
                aria-expanded={open}
                aria-controls="mobile-menu"
                aria-label="Open menu"
                className="grid h-11 w-11 place-items-center rounded-full text-cream md:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={sheet}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.fast }}
            className="landing fixed inset-0 z-[70] flex flex-col overflow-y-auto overscroll-contain bg-midnight/85 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-2xl md:hidden"
          >
            <div className="flex items-center justify-between pl-4 pr-2 py-2">
              <span className="flex items-center gap-2"><SkylineMark className="h-10 w-10" /><span className="t-nav font-extrabold">SSA</span></span>
              <button type="button" onClick={() => closeMenu()} aria-label="Close menu" className="grid h-11 w-11 place-items-center rounded-full border border-cream/15 text-cream">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Menu links" className="mt-8 flex-1 px-2">
              <ul className="flex flex-col">
                {onHome ? navLinks.map((l, i) => (
                  <motion.li key={l.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i + 0.04 }}>
                    <a ref={i === 0 ? firstLink : undefined} href={`#${l.id}`} onClick={go(l.id)} aria-current={isActive(l.id) ? 'true' : undefined}
                      className={`t-h2 flex min-h-16 items-center justify-between border-b border-cream/15 py-3 ${isActive(l.id) ? 'text-flame' : 'text-cream'}`}>
                      {l.label}
                    </a>
                  </motion.li>
                )) : appLinks.map((l, i) => (
                  <motion.li key={l.to} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i + 0.04 }}>
                    <Link ref={i === 0 ? firstLink : undefined} to={l.to} onClick={goRoute(l.to)} aria-current={loc.pathname.startsWith(l.to) ? 'page' : undefined}
                      className={`t-h2 flex min-h-16 items-center border-b border-cream/15 py-3 ${loc.pathname.startsWith(l.to) ? 'text-flame' : 'text-cream'}`}>{l.label}</Link>
                  </motion.li>
                ))}
              </ul>
            </nav>
            <div className="mt-8 grid gap-3 px-2">
              {me && home ? (<>
                <div className="flex items-center gap-3 rounded-2xl border border-cream/15 px-4 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cream font-bold text-midnight" aria-hidden>{me.user.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-bold text-cream">{me.user.name}</span><span className="block truncate text-xs text-cream/70">{me.user.email}</span></span>
                </div>
                <button type="button" onClick={() => closeMenu(logout)} className="btn-l-secondary"><LogOut className="h-4 w-4" aria-hidden />Log out</button>
                <Link to={home.to} onClick={goRoute(home.to)} className="btn-l-primary">{home.label}</Link>
              </>) : (<>
                <Link to="/login" onClick={goRoute('/login')} className="btn-l-secondary">Login</Link>
                {onHome ? <a href="#join" onClick={go('join')} className="btn-l-primary">Become a member</a> : <Link to="/register" onClick={goRoute('/register')} className="btn-l-primary">Join</Link>}
              </>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
