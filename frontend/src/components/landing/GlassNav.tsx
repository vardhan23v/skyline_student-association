import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { navLinks, type SectionId } from '../../data/landing';
import { lockScroll, scrollToSection } from '../../hooks/useSmoothScroll';
import { SkylineMark } from './SectionHeading';
import { dur } from '../../lib/motion';

/** Floating glass pill nav. Shrinks after 80px of scroll; tracks the section in view. */
export function GlassNav() {
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
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id as SectionId)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    (['events', 'past', 'merch', 'about', 'gallery', 'join'] as const).forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

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
          <a href="#top" onClick={go('top')} className="flex items-center gap-2 rounded-full text-cream">
            <SkylineMark className={`text-cream transition-all ${scrolled ? 'h-6 w-6' : 'h-7 w-7'}`} />
            <span className="t-nav font-extrabold">SSA</span>
          </a>
          <ul className="hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
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
            <Link to="/login" className="t-nav hidden rounded-full px-4 py-2 text-cream/80 transition-colors hover:text-cream sm:block">Login</Link>
            <a href="#join" onClick={go('join')} data-cursor="button" className="btn-l-primary btn-l-sm hidden sm:inline-flex">Become a member</a>
            <button
              ref={menuBtn}
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label="Open menu"
              className="grid h-11 w-11 place-items-center rounded-full text-cream md:hidden"
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
            className="fixed inset-0 z-[70] flex flex-col bg-midnight/85 px-6 pb-10 pt-6 backdrop-blur-2xl md:hidden"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2"><SkylineMark className="h-7 w-7 text-cream" /><span className="t-nav font-extrabold">SSA</span></span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-11 w-11 place-items-center rounded-full border border-cream/15 text-cream">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="mt-12 flex flex-1 flex-col gap-2">
              {navLinks.map((l, i) => (
                <motion.li key={l.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.05 }}>
                  <a ref={i === 0 ? firstLink : undefined} href={`#${l.id}`} onClick={go(l.id)} className="t-h2 block border-b border-cream/15 py-4 text-cream">
                    {l.label}
                  </a>
                </motion.li>
              ))}
            </ul>
            <div className="grid gap-3">
              <a href="#join" onClick={go('join')} className="btn-l-primary">Become a member</a>
              <Link to="/login" className="btn-l-secondary">Login</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
