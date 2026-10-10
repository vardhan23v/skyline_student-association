import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

let lenis: Lenis | null = null;
const NAV_OFFSET = -88;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Phones and tablets: native momentum scrolling feels right there, and Lenis would fight it. */
const touch = () => typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches;

/** Lenis smooth scrolling for the lifetime of the calling page; skipped on touch screens and under reduced motion. */
export function useSmoothScroll() {
  useEffect(() => {
    if (reducedMotion() || touch()) return;
    lenis = new Lenis({ autoRaf: true, lerp: 0.1 });
    return () => { lenis?.destroy(); lenis = null; };
  }, []);
}

/** Scroll to a section id, through Lenis when active, and move focus there for keyboard users. */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: NAV_OFFSET });
  else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + NAV_OFFSET, behavior: reducedMotion() ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
  history.replaceState(null, '', `#${id}`);
}

/** Pause page scrolling while an overlay (menu, lightbox) is open. */
export function lockScroll(locked: boolean) {
  document.documentElement.style.overflow = locked ? 'hidden' : '';
  if (locked) lenis?.stop(); else lenis?.start();
}
