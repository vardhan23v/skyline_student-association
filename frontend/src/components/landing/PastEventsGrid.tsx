import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/client';
import type { Event } from '@/api/types';
import { pastPhotos } from '../../data/landing';
import { SectionHeading } from './SectionHeading';
import { useMediaQuery } from '../../hooks/useCursorFollow';
import { eventImage } from '../EventPhoto';

const fullFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
/** Past = any non-draft event that has started, newest first. Same `['events']` query as the Events page. Each tile
 *  shows the event's own photo; one without a photo borrows a stand-in from `pastPhotos`. */
const pastOnly = (events: Event[] = []) => events.filter((e) => e.status !== 'draft' && +new Date(e.starts_at) <= Date.now()).sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));

/** Bento placement (lg up, used with a full set of 6) and parallax speed per tile (px of travel across the viewport). */
const layout = [
  { span: 'lg:col-span-2 lg:row-span-2', speed: 50 },
  { span: 'lg:col-span-1 lg:row-span-1', speed: -35 },
  { span: 'lg:col-span-1 lg:row-span-2', speed: 70 },
  { span: 'lg:col-span-1 lg:row-span-1', speed: -55 },
  { span: 'lg:col-span-1 lg:row-span-1', speed: 30 },
  { span: 'sm:col-span-2 lg:col-span-3 lg:row-span-1', speed: -40 },
];

function Tile({ ev, fallback, span, speed, parallax }: { ev: Event; fallback: (typeof pastPhotos)[number]; span: string; speed: number; parallax: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const own = ev.image_url ? eventImage(ev.image_url) : null;
  // Stand-ins have a 480px copy next to the 900px original.
  const photo = own
    ? { src: own.src, srcSet: own.srcSet, webp: own.webp, blur: own.blur, alt: ev.image_alt || '' }
    : { src: fallback.image, srcSet: `${fallback.image.replace(/\.jpg$/, '-480.jpg')} 480w, ${fallback.image} 900w`, webp: undefined, blur: undefined, alt: fallback.alt };
  const sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw';
  const meta = [ev.category && ev.category !== 'general' ? ev.category : null, ev.attended ? `${ev.attended} attended` : null].filter(Boolean).join(' · ');
  const reduce = useReducedMotion() || !parallax;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-speed, speed]);
  return (
    <figure ref={ref} tabIndex={0} className={`group relative h-60 overflow-hidden rounded-2xl border border-cream/20 bg-cover bg-center outline-none focus-visible:ring-2 focus-visible:ring-cream sm:h-64 ${span}`} style={photo.blur ? { backgroundImage: `url(${photo.blur})` } : undefined}>
      <picture>
      {photo.webp && <source type="image/webp" srcSet={photo.webp} sizes={sizes} />}
      <motion.img
        src={photo.src}
        // Phone-size copy first (npm run media:prepare / photos:prepare); the full photo from sm.
        srcSet={photo.srcSet}
        sizes={photo.srcSet ? sizes : undefined}
        alt={photo.alt}
        width={900}
        height={1100}
        loading="lazy"
        decoding="async"
        style={{ y }}
        className="absolute inset-x-0 -top-[15%] h-[130%] w-full object-cover grayscale transition-[filter] duration-500 group-hover:grayscale-0 group-focus-visible:grayscale-0 [@media(hover:none)]:grayscale-0"
      />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-t from-midnight/95 via-midnight/45 to-transparent" />
      <figcaption className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <span className="mb-3 block h-px w-full origin-left scale-x-0 bg-cream transition-transform duration-500 group-hover:scale-x-100" />
        <span className="t-h3 block !text-base text-cream sm:!text-lg">{ev.title}</span>
        <span className="t-label mt-1 block text-cream/75">{fullFmt.format(new Date(ev.starts_at))}{ev.venue ? ` · ${ev.venue}` : ''}</span>
        {meta && <span className="t-label mt-1 block text-cream/60">{meta}</span>}
        {/* Description: revealed on hover or keyboard focus; always shown on touch screens. */}
        {ev.description && <span className="t-body mt-2 block max-h-0 overflow-hidden !text-sm !leading-snug text-cream/85 opacity-0 transition-[max-height,opacity] duration-500 group-hover:max-h-24 group-hover:opacity-100 group-focus-visible:max-h-24 group-focus-visible:opacity-100 [@media(hover:none)]:line-clamp-2 [@media(hover:none)]:max-h-12 [@media(hover:none)]:opacity-100">{ev.description}</span>}
      </figcaption>
    </figure>
  );
}

export function PastEventsGrid() {
  // Parallax only from md: on phones the tiles are full-width and the drift just reads as lag.
  const parallax = useMediaQuery('(min-width: 768px)');
  const q = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const past = pastOnly(q.data).slice(0, layout.length);
  // Nothing has happened yet (or the list failed): leave the section out rather than show placeholders.
  if (!past.length) return null;
  // The bento needs all six tiles; with fewer, an even grid of equal tiles.
  const bento = past.length === layout.length;
  return (
    <section id="past" data-bg="past" data-theme="dark" tabIndex={-1} aria-labelledby="past-h" className="l-section border-t border-cream/20 outline-none">
      <div className="l-gutter mx-auto max-w-7xl">
        <SectionHeading id="past-h" script="past" title="Events" />
        {/* 1 column on phones, 2 from sm, the bento from lg. */}
        <div className={`mt-8 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 ${bento ? 'lg:auto-rows-[220px] lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {past.map((ev, i) => <Tile key={ev.id} ev={ev} fallback={pastPhotos[i % pastPhotos.length]} parallax={parallax} speed={layout[i].speed} span={bento ? `lg:h-auto ${layout[i].span}` : 'lg:h-72'} />)}
        </div>
      </div>
    </section>
  );
}
