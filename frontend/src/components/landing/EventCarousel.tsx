import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock, MapPin, MoveRight, Ticket } from 'lucide-react';
import { get } from '@/api/client';
import type { Event } from '@/api/types';
import { eventPrice } from '@/components/format';
import { SectionHeading } from './SectionHeading';
import { dur, ease } from '../../lib/motion';
import { useFinePointer } from '../../hooks/useCursorFollow';

const HINT_KEY = 'ssa_swipe_hint';

const MAX_TILT = 6;

const dayFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit' });
const monFmt = new Intl.DateTimeFormat('en-IN', { month: 'short' });
const wdFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const fullFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Upcoming = published and not started yet, soonest first. The same `['events']` query as the Events page. */
export const upcomingOnly = (events: Event[] = []) => events.filter((e) => e.status === 'published' && +new Date(e.starts_at) > Date.now()).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));

function EventCardItem({ ev, index }: { ev: Event; index: number }) {
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
  const when = new Date(ev.starts_at);
  const day = dayFmt.format(when), month = monFmt.format(when).toUpperCase(), weekday = wdFmt.format(when).toUpperCase();
  const soldOut = ev.seats_left === 0;

  return (
    // Observe the <li>, animate the inner wrapper. Opacity + transform only (compositor), so
    // revealing cards never forces a repaint while the page is scrolling.
    <motion.li
      // ~85% of the track on phones so the next card peeks in; fixed 360px from sm.
      className="w-[85%] shrink-0 snap-start [perspective:1000px] sm:w-[360px]"
      initial="hidden"
      whileInView="show"
      // Low threshold: the peeking next card (~15% visible on a phone) must still fade in.
      viewport={{ once: true, amount: 0.1 }}
    >
      <motion.div
        className="h-full"
        variants={reduce
          ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
          : { hidden: { opacity: 0, y: 40 }, show: { opacity: 1, y: 0, transitionEnd: { transform: 'none' } } }}
        transition={{ duration: dur.slow, ease: ease.inOut, delay: (index % 3) * 0.08 }}
      >
      <motion.article
        onPointerMove={onMove}
        onPointerLeave={reset}
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        className="glass-l group relative flex h-full flex-col overflow-hidden rounded-2xl"
      >
        {/* Typographic card: events have no photo. Everything below comes from the event row. */}
        <div className="flex items-start justify-between gap-4 border-b border-cream/12 p-5">
          <p className="leading-none text-cream" aria-hidden="true">
            <span className="block text-[3.5rem] font-extrabold tracking-tight text-flame">{day}</span>
            <span className="t-label mt-2 block text-cream/70">{month} · {weekday}</span>
          </p>
          <span className="sr-only">{fullFmt.format(when)}</span>
          <span className="t-label max-w-[11rem] shrink-0 rounded-full border border-cream/25 px-3 py-1.5 text-right !text-[0.65rem] !leading-snug text-cream/80">{eventPrice(ev)}</span>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-5">
          <h3 className="t-h3 text-cream">{ev.title}</h3>
          {ev.description && <p className="t-body line-clamp-4 !text-[0.95rem] text-cream/70">{ev.description}</p>}
          <dl className="mt-auto grid gap-2 text-sm text-cream/80">
            {ev.venue && <div className="flex items-center gap-2"><dt className="sr-only">Venue</dt><MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-cream/60" /><dd>{ev.venue}</dd></div>}
            <div className="flex items-center gap-2"><dt className="sr-only">Starts</dt><Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-cream/60" /><dd>{timeFmt.format(when)}</dd></div>
            <div className="flex items-center gap-2"><dt className="sr-only">Seats</dt><Ticket aria-hidden="true" className="h-4 w-4 shrink-0 text-cream/60" /><dd>{soldOut ? 'Sold out' : `${ev.seats_left} of ${ev.capacity} seats left`}</dd></div>
          </dl>
          <Link to={`/events/${ev.id}`} className="t-nav mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-cream/30 px-4 py-2 font-bold text-cream transition-colors hover:border-cream hover:bg-cream hover:text-midnight sm:w-fit">
            {soldOut ? 'View event' : 'Get tickets'} <span className="sr-only">for {ev.title}</span><ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </motion.article>
      </motion.div>
    </motion.li>
  );
}

export function EventCarousel() {
  const track = useRef<HTMLUListElement>(null);
  const q = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const upcoming = upcomingOnly(q.data);
  const fine = useFinePointer();
  const page = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' });
  // Touch: a "swipe" hint the first time the carousel is seen, gone after the first swipe (and on later visits).
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem(HINT_KEY); } catch { return false; } });
  useEffect(() => {
    const el = track.current;
    if (!hint || !el) return;
    const done = () => { if (el.scrollLeft < 24) return; setHint(false); try { localStorage.setItem(HINT_KEY, '1'); } catch { /* storage blocked */ } };
    el.addEventListener('scroll', done, { passive: true });
    return () => el.removeEventListener('scroll', done);
  }, [hint]);
  return (
    <section id="events" data-bg="events" data-theme="dark" tabIndex={-1} aria-labelledby="events-h" className="l-section border-t border-cream/20 outline-none">
      <div className="l-gutter mx-auto flex max-w-7xl items-end justify-between gap-6">
        <SectionHeading id="events-h" script="upcoming" title="Events" />
        {/* Arrows for mouse users only; touch swipes. */}
        <div className={`gap-2 ${fine ? 'hidden sm:flex' : 'hidden'}`}>
          <button type="button" onClick={() => page(-1)} aria-label="Previous events" className="grid h-11 w-11 place-items-center rounded-full border border-cream/40 text-cream transition-colors hover:border-cream hover:text-cream"><ArrowLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => page(1)} aria-label="Next events" className="grid h-11 w-11 place-items-center rounded-full border border-cream/40 text-cream transition-colors hover:border-cream hover:text-cream"><ArrowRight className="h-5 w-5" /></button>
        </div>
      </div>
      <ul
        ref={track}
        // Sideways swipes scroll the carousel natively; vertical wheel stays with Lenis so the page
        // keeps smooth-scrolling when the cards pass under the pointer (data-lenis-prevent-wheel
        // handed every wheel event to the browser here, which made scrolling stall mid-page).
        data-lenis-prevent-horizontal
        aria-label="Upcoming events"
        className="no-scrollbar mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-4 sm:mt-12 sm:gap-5 md:scroll-px-6 md:px-6 lg:scroll-px-8 lg:px-8 xl:px-[max(2rem,calc((100vw-80rem)/2+2rem))] xl:scroll-px-[max(2rem,calc((100vw-80rem)/2+2rem))]"
      >
        {q.isLoading && [0, 1, 2].map((i) => <li key={i} aria-hidden="true" className="glass-l h-[26rem] w-[85%] shrink-0 animate-pulse rounded-2xl sm:w-[360px]" />)}
        {upcoming.map((ev, i) => <EventCardItem key={ev.id} ev={ev} index={i} />)}
      </ul>
      {!q.isLoading && !upcoming.length && (
        <p className="l-gutter t-body mx-auto max-w-7xl text-cream/70" role="status">
          {q.error ? <>Events couldn't load. <button type="button" onClick={() => q.refetch()} className="underline underline-offset-4 hover:text-cream">Try again</button></> : <>No upcoming events right now. <Link to="/events" className="underline underline-offset-4 hover:text-cream">See all events</Link>.</>}
        </p>
      )}
      {!fine && hint && upcoming.length > 1 && (
        <p className="l-gutter t-label mx-auto mt-2 flex max-w-7xl items-center gap-2 text-cream/70" aria-hidden="true">
          Swipe for more <motion.span animate={{ x: [0, 6, 0] }} transition={{ duration: 1.2, repeat: Infinity, ease: ease.inOut }}><MoveRight className="h-4 w-4" /></motion.span>
        </p>
      )}
    </section>
  );
}
