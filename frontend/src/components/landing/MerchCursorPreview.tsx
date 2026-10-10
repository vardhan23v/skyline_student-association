import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { merch, merchShopHref, type MerchItem } from '../../data/landing';
import { useCursorFollow, useFinePointer, useMediaQuery } from '../../hooks/useCursorFollow';
import { SectionHeading } from './SectionHeading';

/** One media layer: poster image underneath, video on top once the item has been hovered. */
function MediaLayer({ item, active, load }: { item: MerchItem; active: boolean; load: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) v.play().catch(() => {}); else v.pause();
  }, [active, load]);
  return (
    <div className={`absolute inset-0 transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`}>
      <img src={item.image} alt="" width={640} height={800} className={`h-full w-full object-cover transition-transform duration-[4000ms] ease-out ${active ? 'scale-110' : 'scale-100'}`} />
      {load && !failed && (
        <video ref={video} src={item.video} poster={item.image} muted playsInline loop preload="metadata" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  );
}

/** Rounded 320×400 card that trails the cursor and crossfades between merch items. */
export function MerchCursorPreview({ activeId, loaded }: { activeId: string | null; loaded: Set<string> }) {
  const ref = useCursorFollow<HTMLDivElement>({ ease: 0.12, maxTilt: 8 });
  // Portalled so section transitions (transforms/clips on ancestors) can't trap the fixed card.
  return createPortal(
    <div ref={ref} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-40 will-change-transform">
      <AnimatePresence>
        {activeId && (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="relative h-[400px] w-[320px] overflow-hidden rounded-3xl border border-cream/10 shadow-2xl shadow-midnight"
          >
            {merch.map((m) => <MediaLayer key={m.id} item={m} active={m.id === activeId} load={loaded.has(m.id)} />)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/**
 * Touch card: poster first; the video loads and plays (muted, inline) only while this card is the one mostly in view.
 * `preload="none"`, so nothing downloads until then. A missing video just leaves the poster.
 */
function MerchCard({ item, playing, observe }: { item: MerchItem; playing: boolean; observe: (el: HTMLElement | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [load, setLoad] = useState(false);
  useEffect(() => { if (playing) setLoad(true); }, [playing]);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) v.play().catch(() => {}); else v.pause();
  }, [playing, load]);
  return (
    <li ref={observe} data-merch={item.id} className="glass-l flex flex-col overflow-hidden rounded-2xl">
      <div className="relative aspect-[4/5] overflow-hidden">
        <img src={item.image} alt={item.alt} width={640} height={800} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        {load && !failed && <video ref={video} src={item.video} poster={item.image} muted playsInline loop preload="none" aria-hidden="true" onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${playing ? 'opacity-100' : 'opacity-0'}`} />}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="t-h3 !text-lg text-cream">{item.name}</h3>
          <span className="text-base text-cream/70">{item.price}</span>
        </div>
        <Link to={merchShopHref} className="btn-l-secondary btn-l-sm !min-h-11 mt-auto w-full">Shop<span className="sr-only"> {item.name}</span><ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link>
      </div>
    </li>
  );
}

export function MerchSection() {
  // The editorial list with the cursor-follow video is for a mouse on a wide screen; touch and narrow get cards.
  const fine = useFinePointer();
  const wide = useMediaQuery('(min-width: 768px)');
  const desktop = fine && wide;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const enter = (id: string) => { setActiveId(id); setLoaded((s) => (s.has(id) ? s : new Set(s).add(id))); };

  // Cards: the one most in view (at least 75% visible) plays; every other video is paused.
  const [playing, setPlaying] = useState<string | null>(null);
  const io = useRef<IntersectionObserver | null>(null);
  const ratios = useRef(new Map<string, number>());
  useEffect(() => {
    if (desktop || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => ratios.current.set((e.target as HTMLElement).dataset.merch!, e.intersectionRatio));
      let best: string | null = null, max = 0.75;
      ratios.current.forEach((r, id) => { if (r >= max) { max = r; best = id; } });
      setPlaying(best);
    }, { threshold: [0, 0.25, 0.5, 0.75, 0.9, 1] });
    io.current = obs;
    document.querySelectorAll<HTMLElement>('[data-merch]').forEach((el) => obs.observe(el));
    return () => { obs.disconnect(); io.current = null; ratios.current.clear(); };
  }, [desktop]);
  const observe = (el: HTMLElement | null) => { if (el) io.current?.observe(el); };

  return (
    <section id="merch" data-bg="merch" data-theme="dark" tabIndex={-1} aria-labelledby="merch-h" className="l-section border-t border-cream/20 outline-none">
      <div className="l-gutter mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading id="merch-h" script="wear the" title="Horizon" />
          <Link to={merchShopHref} data-cursor="button" className="btn-l-primary w-full sm:w-auto">
            Shop merch <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        {desktop ? (<>
          {/* Desktop: editorial list with the cursor-follow preview. */}
          <ul className="mt-14 border-t border-cream/20" onPointerLeave={() => setActiveId(null)}>
            {merch.map((m) => (
              <li key={m.id} className="border-b border-cream/20">
                <Link
                  to={merchShopHref}
                  data-cursor="merch"
                  onPointerEnter={() => enter(m.id)}
                  onFocus={() => enter(m.id)}
                  onBlur={() => setActiveId(null)}
                  className="group flex items-baseline justify-between gap-6 py-6"
                >
                  <span className={`t-display !text-[clamp(3rem,7vw,6.5rem)] transition-[color,transform] duration-300 group-hover:translate-x-3 group-hover:text-flame ${activeId && activeId !== m.id ? 'text-cream/30' : 'text-cream'}`}>
                    {m.name}
                  </span>
                  <span className="text-2xl font-medium text-cream/70">{m.price}</span>
                </Link>
              </li>
            ))}
          </ul>
          <MerchCursorPreview activeId={activeId} loaded={loaded} />
        </>) : (
          /* Touch and narrow screens: one card per item; 1 column on phones, 2 from sm, 4 on a wide touch screen. */
          <ul className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {merch.map((m) => <MerchCard key={m.id} item={m} playing={playing === m.id} observe={observe} />)}
          </ul>
        )}
      </div>
    </section>
  );
}
