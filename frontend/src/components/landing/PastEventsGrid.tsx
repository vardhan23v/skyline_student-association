import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { pastEvents, type PastEvent } from '../../data/landing';
import { SectionHeading } from './SectionHeading';
import { fullDate } from './format';

/** Bento placement and parallax speed per tile (px of travel across the viewport). */
const layout = [
  { span: 'col-span-2 row-span-2', speed: 50 },
  { span: 'col-span-1 row-span-1', speed: -35 },
  { span: 'col-span-1 row-span-2', speed: 70 },
  { span: 'col-span-1 row-span-1', speed: -55 },
  { span: 'col-span-2 row-span-1 md:col-span-1', speed: 30 },
  { span: 'col-span-2 row-span-1 md:col-span-3', speed: -40 },
];

function Tile({ ev, span, speed }: { ev: PastEvent; span: string; speed: number }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-speed, speed]);
  return (
    <figure ref={ref} className={`group relative overflow-hidden rounded-2xl border border-ash/20 ${span}`}>
      <motion.img
        src={ev.image}
        alt={ev.alt}
        width={900}
        height={1100}
        loading="lazy"
        decoding="async"
        style={{ y }}
        className="absolute inset-x-0 -top-[15%] h-[130%] w-full object-cover grayscale transition-[filter] duration-500 group-hover:grayscale-0 [@media(hover:none)]:grayscale-0"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-midnight/90 via-midnight/10 to-transparent" />
      <figcaption className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <span className="mb-3 block h-px w-full origin-left scale-x-0 bg-crimson transition-transform duration-500 group-hover:scale-x-100" />
        <span className="block text-base font-bold text-ivory sm:text-lg">{ev.title}</span>
        <span className="label-wide mt-1 block text-ivory/65">{fullDate(ev.date)}</span>
      </figcaption>
    </figure>
  );
}

export function PastEventsGrid() {
  return (
    <section id="past" data-theme="dark" tabIndex={-1} aria-labelledby="past-h" className="border-t border-ash/20 py-24 outline-none sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <SectionHeading id="past-h" script="past" title="Events" />
        <div className="mt-12 grid auto-rows-[160px] grid-cols-2 gap-3 sm:auto-rows-[220px] sm:gap-4 md:grid-cols-4">
          {pastEvents.slice(0, layout.length).map((ev, i) => <Tile key={ev.title} ev={ev} {...layout[i]} />)}
        </div>
      </div>
    </section>
  );
}
