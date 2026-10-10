import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { upcomingEvents, type UpcomingEvent } from '../../data/landing';
import { SectionHeading } from './SectionHeading';
import { dateParts, fullDate } from './format';
import { dur, ease } from '../../lib/motion';

const MAX_TILT = 6;

function EventCardItem({ ev, index }: { ev: UpcomingEvent; index: number }) {
  const reduce = useReducedMotion();
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 2 * MAX_TILT);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 2 * MAX_TILT);
  };
  const reset = () => { rx.set(0); ry.set(0); };
  const { day, month } = dateParts(ev.date);

  return (
    // Observe the <li>, clip the inner wrapper: a clipped target never reports as intersecting.
    <motion.li
      className="w-[78vw] max-w-[340px] shrink-0 snap-start [perspective:1000px]"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      <motion.div
        className="h-full"
        variants={reduce
          ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
          : { hidden: { clipPath: 'inset(100% 0% 0% 0%)' }, show: { clipPath: 'inset(0% 0% 0% 0%)' } }}
        transition={{ duration: dur.slow, ease: ease.inOut, delay: (index % 3) * 0.08 }}
      >
      <motion.article
        onPointerMove={onMove}
        onPointerLeave={reset}
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-ash/20 bg-ivory/[0.03]"
      >
        {/* Image doubles as a mouse shortcut to tickets; keyboard and AT use the "Get tickets" link. */}
        <Link to={ev.href} tabIndex={-1} aria-hidden="true" data-cursor="view" data-cursor-label="Tickets" className="relative block aspect-[4/5] overflow-hidden">
          <img src={ev.image} alt={ev.alt} width={800} height={1000} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]" />
          <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/10 to-transparent" />
          <p className="absolute left-4 top-4 flex flex-col items-center rounded-xl bg-crimson px-3 py-2 leading-none text-ivory">
            <span className="text-xl font-extrabold">{day}</span>
            <span className="mt-1 text-[0.65rem] font-bold tracking-[0.2em]">{month}</span>
            <span className="sr-only">{fullDate(ev.date)}</span>
          </p>
        </Link>
        <div className="flex flex-1 flex-col gap-2 p-5">
          <h3 className="text-xl font-bold text-ivory">{ev.title}</h3>
          <p className="flex items-center gap-1.5 text-sm text-ivory/65"><MapPin aria-hidden="true" className="h-4 w-4 text-ash" />{ev.venue}</p>
          <Link to={ev.href} className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-ivory/25 px-4 py-2 text-sm font-bold text-ivory transition-colors hover:border-crimson hover:bg-crimson">
            Get tickets <span className="sr-only">for {ev.title}</span><ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </motion.article>
      </motion.div>
    </motion.li>
  );
}

export function EventCarousel() {
  const track = useRef<HTMLUListElement>(null);
  const page = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section id="events" data-theme="dark" tabIndex={-1} aria-labelledby="events-h" className="border-t border-ash/20 py-24 outline-none sm:py-32">
      <div className="mx-auto flex max-w-7xl items-end justify-between gap-6 px-4 sm:px-8">
        <SectionHeading id="events-h" script="upcoming" title="Events" />
        <div className="hidden gap-2 sm:flex">
          <button type="button" onClick={() => page(-1)} aria-label="Previous events" className="grid h-11 w-11 place-items-center rounded-full border border-ash/40 text-ivory transition-colors hover:border-crimson hover:text-crimson"><ArrowLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => page(1)} aria-label="Next events" className="grid h-11 w-11 place-items-center rounded-full border border-ash/40 text-ivory transition-colors hover:border-crimson hover:text-crimson"><ArrowRight className="h-5 w-5" /></button>
        </div>
      </div>
      <ul
        ref={track}
        data-lenis-prevent-wheel
        aria-label="Upcoming events"
        className="no-scrollbar mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-4 px-4 pb-4 sm:scroll-px-8 sm:px-8 xl:px-[max(2rem,calc((100vw-80rem)/2+2rem))] xl:scroll-px-[max(2rem,calc((100vw-80rem)/2+2rem))]"
      >
        {upcomingEvents.map((ev, i) => <EventCardItem key={ev.id} ev={ev} index={i} />)}
      </ul>
    </section>
  );
}
