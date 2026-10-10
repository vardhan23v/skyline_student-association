import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { hero } from '../../data/landing';
import { scrollToSection } from '../../hooks/useSmoothScroll';

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();
  const letter = (i: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: '0.6em' },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease, delay: 0.35 + i * 0.03 },
  });
  const go = (href: string) => (e: React.MouseEvent) => { e.preventDefault(); scrollToSection(href.slice(1)); };
  const words = hero.title.toUpperCase().split(' ');
  let n = 0;

  return (
    <section id="top" tabIndex={-1} className="relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-4 pb-24 pt-32 text-center outline-none">
      <div aria-hidden="true" className="hero-glow pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[90vmax] w-[90vmax] -translate-x-1/2 -translate-y-1/2 opacity-70" />

      <h1 className="max-w-6xl">
        <span className="sr-only">{hero.script} {hero.title}</span>
        <motion.span
          aria-hidden="true"
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1.1, ease }}
          className="block font-script text-[clamp(4.5rem,16vw,12rem)] leading-[0.9] text-crimson"
        >
          {hero.script}
        </motion.span>
        <span aria-hidden="true" className="mt-2 flex flex-wrap justify-center gap-x-[0.5em] text-[clamp(1.35rem,4.6vw,3.75rem)] font-extrabold leading-tight tracking-[0.2em] text-ivory">
          {words.map((w) => (
            <span key={w} className="inline-flex overflow-hidden">
              {w.split('').map((c) => <motion.span key={n} className="inline-block" {...letter(n++)}>{c}</motion.span>)}
            </span>
          ))}
        </span>
      </h1>

      <motion.div initial={{ opacity: 0, y: reduce ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 1.1 }} className="mt-8 max-w-xl">
        <p className="text-xl font-medium text-ivory sm:text-2xl">{hero.tagline}</p>
        <p className="mt-3 text-base text-ivory/65">{hero.subline}</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={hero.primaryCta.href} onClick={go(hero.primaryCta.href)} className="rounded-full bg-crimson px-7 py-3.5 font-bold text-ivory transition-[filter,transform] hover:brightness-110 active:scale-[0.98]">
            {hero.primaryCta.label}
          </a>
          <a href={hero.secondaryCta.href} onClick={go(hero.secondaryCta.href)} className="rounded-full border border-ivory/40 px-7 py-3.5 font-bold text-ivory transition-colors hover:border-ivory hover:bg-ivory/5">
            {hero.secondaryCta.label}
          </a>
        </div>
      </motion.div>

      <a href="#events" onClick={go('#events')} aria-label="Scroll to upcoming events" className="absolute bottom-8 left-1/2 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-full text-ash">
        <motion.span animate={reduce ? undefined : { y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
          <ChevronDown className="h-6 w-6" />
        </motion.span>
      </a>
    </section>
  );
}
