import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { merch, merchShopHref, type MerchItem } from '../../data/landing';
import { useCursorFollow, useFinePointer } from '../../hooks/useCursorFollow';
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

export function MerchSection() {
  const fine = useFinePointer();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const enter = (id: string) => { setActiveId(id); setLoaded((s) => (s.has(id) ? s : new Set(s).add(id))); };

  return (
    <section id="merch" data-bg="merch" data-theme="dark" tabIndex={-1} aria-labelledby="merch-h" className="border-t border-cream/20 py-24 outline-none sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading id="merch-h" script="wear the" title="Horizon" />
          <Link to={merchShopHref} data-cursor="button" className="btn-l-primary">
            Shop merch <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        {/* Desktop: editorial list with the cursor-follow preview. */}
        <ul className="mt-14 hidden border-t border-cream/20 md:block" onPointerLeave={() => setActiveId(null)}>
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
        {fine && <MerchCursorPreview activeId={activeId} loaded={loaded} />}

        {/* Mobile and touch: inline cards. */}
        <ul className="mt-12 grid grid-cols-2 gap-3 md:hidden">
          {merch.map((m) => (
            <li key={m.id}>
              <Link to={merchShopHref} className="block overflow-hidden rounded-2xl border border-cream/20">
                <img src={m.image} alt={m.alt} width={640} height={800} loading="lazy" decoding="async" className="aspect-[4/5] w-full object-cover" />
                <span className="flex items-baseline justify-between gap-2 p-3">
                  <span className="t-h3 !text-base text-cream">{m.name}</span>
                  <span className="text-sm text-cream/70">{m.price}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
