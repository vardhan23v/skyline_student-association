import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { backgrounds, type SectionBackground } from '../../data/backgrounds';
import { Embers } from './Embers';

/** Crossfade window: this fraction of the viewport height either side of a section boundary. */
const FADE = 0.3;
/** Background drift relative to scroll, and its cap as a fraction of the viewport height. */
const PARALLAX = 0.15;
const MAX_DRIFT = 0.1;
/** Reduced-motion fallback: a plain fade between backgrounds. */
const REDUCED_FADE_MS = 300;

type Bound = { top: number; bottom: number };
type Mode = 'full' | 'lite' | 'reduced';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/**
 * Fixed layer behind the landing page holding every section background, stacked in page order.
 * As a `[data-bg]` section's top edge crosses the middle of the viewport, its layer fades in over
 * the previous one: scroll-linked, so scrolling back reverses it exactly. The incoming image settles
 * from scale 1.08; the outgoing one eases to 1.04. (No animated blur: a full-screen filter
 * re-rasterises every frame and caused scroll jank between sections.) Only the two layers in a crossfade
 * are visible; the rest are `visibility: hidden`. Phones get a plain opacity crossfade, reduced
 * motion a short timed fade.
 */
export function BackgroundStage({ variant = 'stage' }: {
  /**
   * `stage`: the landing page's scroll-linked crossfade. `still`: just the hero image with the same scrim, heat glow,
   * vignette and embers (login, register, account and public app pages). `dim`: the hero image blurred under a strong
   * midnight overlay, no embers, so dense admin tables stay readable.
   */
  variant?: 'stage' | 'still' | 'dim';
} = {}) {
  return variant === 'stage' ? <ScrollStage /> : <StillStage dim={variant === 'dim'} />;
}

/** One static hero layer. The blur is a static filter on a layer that never moves, so it rasterises once. */
function StillStage({ dim }: { dim: boolean }) {
  const hero = backgrounds[0];
  const [ready, setReady] = useState(false);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-midnight">
      <div className={`absolute inset-0 ${dim ? 'scale-110 blur-2xl' : ''}`}>
        {!ready && <div className="absolute inset-0 scale-110 bg-cover blur-2xl" style={{ backgroundImage: `url(${hero.placeholder})`, backgroundPosition: hero.focal }} />}
        <picture>
          <source type="image/avif" srcSet={hero.picture.sources.avif} sizes="100vw" />
          <source type="image/webp" srcSet={hero.picture.sources.webp} sizes="100vw" />
          <img src={hero.picture.img.src} srcSet={hero.picture.sources.jpeg} sizes="100vw" width={hero.picture.img.w} height={hero.picture.img.h} alt="" decoding="async"
            {...({ fetchpriority: 'high' } as Record<string, string>)} onLoad={() => setReady(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`} style={{ objectPosition: hero.focal }} />
        </picture>
      </div>
      <div className="absolute inset-0" style={{ background: `color-mix(in srgb, var(--midnight) ${dim ? 80 : Math.round(hero.overlay * 100)}%, transparent)` }} />
      <div className="bg-scrim absolute inset-0" />
      {!dim && <div className="bg-heat absolute inset-0" />}
      <div className="bg-vignette absolute inset-0" />
      {!dim && <Embers />}
    </div>
  );
}

function ScrollStage() {
  const reduce = useReducedMotion();
  const narrow = useMediaQuery('(max-width: 768px)');
  const mode: Mode = reduce ? 'reduced' : narrow ? 'lite' : 'full';

  const { scrollY } = useScroll();
  /** Document-space y of the viewport's middle. Re-derived when sections are re-measured. */
  const mid = useMotionValue(0);
  const bounds = useRef<Bound[]>(backgrounds.map(() => ({ top: 0, bottom: 0 })));
  const vh = useRef(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [load, setLoad] = useState<Set<string>>(() => new Set([backgrounds[0].id]));
  const [active, setActive] = useState(0);

  useEffect(() => {
    const els = backgrounds.map((b) => document.querySelector<HTMLElement>(`[data-bg="${b.id}"]`));
    const activeAt = (m: number) => {
      let idx = 0;
      bounds.current.forEach((b, i) => { if (b.top <= m) idx = i; });
      return idx;
    };
    const update = (y: number) => {
      const m = y + vh.current / 2;
      mid.set(m);
      setActive(activeAt(m));
    };
    const measure = () => {
      vh.current = window.innerHeight;
      els.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        bounds.current[i] = { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
      });
      // Nudge so derived values recompute against the new bounds even if scroll hasn't moved.
      mid.set(-1);
      update(window.scrollY);
    };
    measure();
    const unsub = scrollY.on('change', update);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('resize', measure);
    // Fetch each background one viewport before its section arrives.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const id = (e.target as HTMLElement).dataset.bg!;
        setLoad((s) => (s.has(id) ? s : new Set(s).add(id)));
      }),
      { rootMargin: '100% 0px' },
    );
    els.forEach((el) => el && io.observe(el));
    return () => { unsub(); ro.disconnect(); io.disconnect(); window.removeEventListener('resize', measure); };
  }, [scrollY, mid]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-midnight">
      {backgrounds.map((bg, i) => (
        <Layer key={bg.id} bg={bg} index={i} mid={mid} bounds={bounds} vh={vh} mode={mode} active={active} load={load.has(bg.id)} />
      ))}
      <div className="bg-scrim absolute inset-0" />
      {/* Depth: a low heat glow, a cinematic vignette, then the embers drifting in front of it all. */}
      <div className="bg-heat absolute inset-0" />
      <div className="bg-vignette absolute inset-0" />
      <Embers />
    </div>
  );
}

type LayerProps = {
  bg: SectionBackground;
  index: number;
  mid: MotionValue<number>;
  bounds: React.MutableRefObject<Bound[]>;
  vh: React.MutableRefObject<number>;
  mode: Mode;
  active: number;
  load: boolean;
};

function Layer({ bg, index, mid, bounds, vh, mode, active, load }: LayerProps) {
  const [ready, setReady] = useState(false);
  const last = index === backgrounds.length - 1;
  /** 0 → 1 as this section's top edge crosses the middle of the viewport. */
  const enter = (m: number) => {
    if (index === 0) return 1;
    const w = FADE * vh.current;
    return clamp((m - (bounds.current[index].top - w)) / (2 * w), 0, 1);
  };
  /** 0 → 1 as the next section takes over. */
  const leave = (m: number) => {
    if (last) return 0;
    const w = FADE * vh.current;
    return clamp((m - (bounds.current[index + 1].top - w)) / (2 * w), 0, 1);
  };

  const opacity = useTransform(mid, (m) => enter(m));
  const visibility = useTransform(mid, (m) => (enter(m) > 0 && leave(m) < 1 ? 'visible' : 'hidden'));
  const transform = useTransform(mid, (m) => {
    if (mode !== 'full') return 'none';
    const scale = (1.08 - 0.08 * enter(m)) * (1 + 0.04 * leave(m));
    const b = bounds.current[index];
    const drift = clamp(((b.top + b.bottom) / 2 - m) * PARALLAX, -MAX_DRIFT * vh.current, MAX_DRIFT * vh.current);
    return `translate3d(0, ${drift.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  });
  // Promote to a GPU layer only while this layer is on screen; seven always-promoted
  // full-screen layers cost memory and compositing time on every scroll frame.
  const willChange = useTransform(visibility, (v) => (v === 'visible' ? 'opacity, transform' : 'auto'));

  const style =
    mode === 'reduced'
      ? { opacity: index === active ? 1 : 0, transition: `opacity ${REDUCED_FADE_MS}ms linear` }
      : { opacity, visibility, transform, willChange };

  return (
    <motion.div className="absolute inset-x-0 -inset-y-[10vh]" style={style}>
      {!ready && (
        <div
          className="absolute inset-0 scale-110 bg-cover blur-2xl"
          style={{ backgroundImage: `url(${bg.placeholder})`, backgroundPosition: bg.focal }}
        />
      )}
      {load && (
        <picture>
          <source type="image/avif" srcSet={bg.picture.sources.avif} sizes="100vw" />
          <source type="image/webp" srcSet={bg.picture.sources.webp} sizes="100vw" />
          <img
            src={bg.picture.img.src}
            srcSet={bg.picture.sources.jpeg}
            sizes="100vw"
            width={bg.picture.img.w}
            height={bg.picture.img.h}
            alt=""
            decoding="async"
            // React 18 doesn't know the camelCase prop; the lowercase HTML attribute passes through as-is.
            {...({ fetchpriority: index === 0 ? 'high' : 'auto' } as Record<string, string>)}
            onLoad={() => setReady(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
            style={{ objectPosition: bg.focal }}
          />
        </picture>
      )}
      <div className="absolute inset-0" style={{ background: `color-mix(in srgb, var(--midnight) ${Math.round(bg.overlay * 100)}%, transparent)` }} />
    </motion.div>
  );
}
