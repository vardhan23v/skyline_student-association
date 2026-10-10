import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, LayoutDashboard, LogOut, Menu, UserRound, X } from 'lucide-react';
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
  { to: '/finance', label: 'Finance' },
];

/** Signed in: avatar button with Dashboard (admin) or My account (user), and Log out. */
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
  const home = admin ? { to: '/admin', label: 'Dashboard', Icon: LayoutDashboard } : { to: '/me', label: 'My account', Icon: UserRound };
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={`Account menu for ${me.user.name}`}
        className="flex items-center gap-1.5 rounded-full border border-cream/15 py-1 pl-1 pr-2.5 text-cream transition-colors hover:border-cream/40">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-cream font-bold text-midnight" aria-hidden>{me.user.name.slice(0, 1).toUpperCase()}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-cream/15 bg-midnight/95 py-1.5 text-cream shadow-xl backdrop-blur-xl">
          <div className="border-b border-cream/10 px-4 pb-2 pt-1.5"><div className="truncate text-sm font-bold">{me.user.name}</div><div className="truncate text-xs text-cream/60">{me.user.email}</div></div>
          <Link role="menuitem" to={home.to} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-cream/10"><home.Icon className="h-4 w-4" aria-hidden />{home.label}</Link>
          <button role="menuitem" type="button" onClick={logout} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-cream/10"><LogOut className="h-4 w-4" aria-hidden />Log out</button>
        </div>
      )}
    </div>
  );
}

/**
 * Floating glass pill nav, shared by the landing page and every public page (and /me).
 * On `/` it shrinks after 80px of scroll and tracks the section in view; elsewhere it links to routes.
 */
export function GlassNav() {
  const { me, logout } = useAuth();
  const onHome = useLocation().pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<SectionId | null>(null);
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

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

  useEffect(() => {
    if (!open) return;
    lockScroll(true);
    firstLink.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { lockScroll(false); window.removeEventListener('keydown', onKey); menuBtn.current?.focus(); };
  }, [open]);

  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); setOpen(false); requestAnimationFrame(() => scrollToSection(id)); };
  // "Past events" has no nav link, so it keeps the Events link lit.
  const isActive = (id: SectionId) => active === id || (id === 'events' && active === 'past');

  return (
    <>
      <header data-theme="dark" className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <nav
          aria-label="Primary"
          className={`flex w-full max-w-5xl items-center justify-between gap-4 rounded-full border border-cream/10 shadow-lg backdrop-blur-xl transition-all duration-300 ${scrolled ? 'bg-midnight/55 px-4 py-2' : 'bg-midnight/35 px-5 py-3'}`}
        >
          {onHome ? (
            <a href="#top" onClick={go('top')} className="flex items-center gap-2 rounded-full text-cream">
              <SkylineMark className={`transition-all ${scrolled ? 'h-8 w-8' : 'h-10 w-10'}`} />
              <span className="t-nav font-extrabold">SSA</span>
            </a>
          ) : (
            <Link to="/" className="flex items-center gap-2 rounded-full text-cream" aria-label="Skyline Student Association home">
              <SkylineMark className={`transition-all ${scrolled ? 'h-8 w-8' : 'h-10 w-10'}`} />
              <span className="t-nav font-extrabold">SSA</span>
            </Link>
          )}
          <ul className="hidden items-center gap-1 lg:flex">
            {!onHome && appLinks.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} className={({ isActive }) => `t-nav relative block px-3 py-2 transition-colors hover:text-cream ${isActive ? 'text-cream' : 'text-cream/70'}`}>
                  {({ isActive }) => <>{l.label}<span className={`absolute inset-x-3 -bottom-0.5 h-px origin-left bg-cream transition-transform duration-300 ${isActive ? 'scale-x-100' : 'scale-x-0'}`} /></>}
                </NavLink>
              </li>
            ))}
            {onHome && navLinks.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  onClick={go(l.id)}
                  aria-current={isActive(l.id) ? 'true' : undefined}
                  className={`t-nav relative block px-3 py-2 transition-colors hover:text-cream ${isActive(l.id) ? 'text-cream' : 'text-cream/70'}`}
                >
                  {l.label}
                  <span className={`absolute inset-x-3 -bottom-0.5 h-px origin-left bg-cream transition-transform duration-300 ${isActive(l.id) ? 'scale-x-100' : 'scale-x-0'}`} />
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            {!me && <Link to="/login" className="t-nav hidden rounded-full px-4 py-2 text-cream/80 transition-colors hover:text-cream sm:block">Login</Link>}
            {!me && onHome && <a href="#join" onClick={go('join')} data-cursor="button" className="btn-l-primary btn-l-sm hidden sm:inline-flex">Become a member</a>}
            {!me && !onHome && <Link to="/register" className="btn-l-primary btn-l-sm hidden sm:inline-flex">Join</Link>}
            <AccountMenu />
            <button
              ref={menuBtn}
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label="Open menu"
              className="grid h-11 w-11 place-items-center rounded-full text-cream lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.fast }}
            className="fixed inset-0 z-[70] flex flex-col bg-midnight/85 px-6 pb-10 pt-6 backdrop-blur-2xl lg:hidden"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2"><SkylineMark className="h-10 w-10" /><span className="t-nav font-extrabold">SSA</span></span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-11 w-11 place-items-center rounded-full border border-cream/15 text-cream">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="mt-12 flex flex-1 flex-col gap-2">
              {onHome ? navLinks.map((l, i) => (
                <motion.li key={l.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.05 }}>
                  <a ref={i === 0 ? firstLink : undefined} href={`#${l.id}`} onClick={go(l.id)} className="t-h2 block border-b border-cream/15 py-4 text-cream">
                    {l.label}
                  </a>
                </motion.li>
              )) : appLinks.map((l, i) => (
                <motion.li key={l.to} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.05 }}>
                  <Link ref={i === 0 ? firstLink : undefined} to={l.to} onClick={() => setOpen(false)} className="t-h2 block border-b border-cream/15 py-4 text-cream">{l.label}</Link>
                </motion.li>
              ))}
            </ul>
            <div className="grid gap-3">
              {me ? (<>
                <Link to={me.user.role === 'admin' ? '/admin' : '/me'} onClick={() => setOpen(false)} className="btn-l-primary">{me.user.role === 'admin' ? 'Dashboard' : 'My account'}</Link>
                <button type="button" onClick={() => { setOpen(false); logout(); }} className="btn-l-secondary">Log out</button>
              </>) : (<>
                {onHome ? <a href="#join" onClick={go('join')} className="btn-l-primary">Become a member</a> : <Link to="/register" onClick={() => setOpen(false)} className="btn-l-primary">Join</Link>}
                <Link to="/login" className="btn-l-secondary">Login</Link>
              </>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
