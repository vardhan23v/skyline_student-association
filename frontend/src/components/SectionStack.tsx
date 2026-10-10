import { Children, useEffect, useRef, type ReactNode } from 'react';

/**
 * Stacked-card section transition: each child pins at the top of the viewport and, as the next
 * one scrolls over it, scales back and dims. Driven by one rAF-throttled scroll handler and CSS
 * transforms only. Under `prefers-reduced-motion` sections simply flow; nothing pins or moves.
 */
export function SectionStack({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>(':scope > .stack-item') ?? [])];
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = innerHeight;
      items.forEach((el, i) => {
        const next = items[i + 1];
        if (!next) { el.style.transform = ''; el.style.opacity = ''; return; }
        // 0 → next section still below the fold; 1 → next section fully covers this one.
        const p = Math.min(1, Math.max(0, 1 - next.getBoundingClientRect().top / vh));
        el.style.transform = `translate3d(0, ${-p * 24}px, 0) scale(${1 - p * 0.06})`;
        el.style.opacity = String(1 - p * 0.55);
        el.style.filter = p > 0 ? `brightness(${1 - p * 0.35})` : '';
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll);
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={root} className={`stack ${className}`}>
      {Children.map(children, (child, i) => <div className="stack-item" style={{ zIndex: i + 1 }}>{child}</div>)}
    </div>
  );
}

/** Reveal-once-on-scroll for blocks inside a section. Pure CSS class toggle via IntersectionObserver. */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('is-in'); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}
