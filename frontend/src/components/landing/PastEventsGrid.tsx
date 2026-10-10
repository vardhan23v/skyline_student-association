import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { pastEvents, type PastEvent } from '../../data/landing';
import { SectionHeading } from './SectionHeading';
import { useMediaQuery } from '../../hooks/useCursorFollow';
import { fullDate } from './format';

/** Bento placement (lg up) and parallax speed per tile (px of travel across the viewport). */
const layout = [
  { span: 'lg:col-span-2 lg:row-span-2', speed: 50 },
  { span: 'lg:col-span-1 lg:row-span-1', speed: -35 },
  { span: 'lg:col-span-1 lg:row-span-2', speed: 70 },
  { span: 'lg:col-span-1 lg:row-span-1', speed: -55 },
  { span: 'lg:col-span-1 lg:row-span-1', speed: 30 },
  { span: 'sm:col-span-2 lg:col-span-3 lg:row-span-1', speed: -40 },
];

function Tile({ ev, span, speed, parallax }: { ev: PastEvent; span: string; speed: number; parallax: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() || !parallax;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-speed, speed]);
  return (
    <figure ref={ref} tabIndex={0} className={`group relative h-60 overflow-hidden rounded-2xl border border-cream/20 outline-none focus-visible:ring-2 focus-visible:ring-cream sm:h-64 lg:h-auto ${span}`}>
      <motion.img
        src={ev.image}
        // 480px copy for phones (npm run media:prepare); the 900px original from sm.
        srcSet={`${ev.image.replace(/\.jpg$/, '-480.jpg')} 480w, ${ev.image} 900w`}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        alt={ev.alt}
        width={900}
        height={1100}
        loading="lazy"
        decoding="async"
        style={{ y }}
        className="absolute inset-x-0 -top-[15%] h-[130%] w-full object-cover grayscale transition-[filter] duration-500 group-hover:grayscale-0 group-focus-visible:grayscale-0 [@media(hover:none)]:grayscale-0"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-midnight/95 via-midnight/45 to-transparent" />
      <figcaption className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <span className="mb-3 block h-px w-full origin-left scale-x-0 bg-cream transition-transform duration-500 group-hover:scale-x-100" />
        <span className="t-h3 block !text-base text-cream sm:!text-lg">{ev.title}</span>
        <span className="t-label mt-1 block text-cream/75">{fullDate(ev.date)} · {ev.venue}</span>
        {/* Description: revealed on hover or keyboard focus; always shown on touch screens. */}
        <span className="t-body mt-2 block max-h-0 overflow-hidden !text-sm !leading-snug text-cream/85 opacity-0 transition-[max-height,opacity] duration-500 group-hover:max-h-24 group-hover:opacity-100 group-focus-visible:max-h-24 group-focus-visible:opacity-100 [@media(hover:none)]:line-clamp-2 [@media(hover:none)]:max-h-12 [@media(hover:none)]:opacity-100">{ev.description}</span>
      </figcaption>
    </figure>
  );
}

export function PastEventsGrid() {
  // Parallax only from md: on phones the tiles are full-width and the drift just reads as lag.
  const parallax = useMediaQuery('(min-width: 768px)');
  return (
    <section id="past" data-bg="past" data-theme="dark" tabIndex={-1} aria-labelledby="past-h" className="l-section border-t border-cream/20 outline-none">
      <div className="l-gutter mx-auto max-w-7xl">
        <SectionHeading id="past-h" script="past" title="Events" />
        {/* 1 column on phones, 2 from sm, the bento from lg. */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:auto-rows-[220px] lg:grid-cols-4">
          {pastEvents.slice(0, layout.length).map((ev, i) => <Tile key={ev.title} ev={ev} parallax={parallax} {...layout[i]} />)}
        </div>
      </div>
    </section>
  );
}
