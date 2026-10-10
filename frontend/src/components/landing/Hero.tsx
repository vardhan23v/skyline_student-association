import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { hero } from '../../data/landing';
import { scrollToSection } from '../../hooks/useSmoothScroll';
import { dur, ease } from '../../lib/motion';


export function Hero() {
  const reduce = useReducedMotion();
  const letter = (i: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: '0.6em' },
    animate: { opacity: 1, y: 0 },
    transition: { duration: dur.base, ease: ease.out, delay: 0.35 + i * 0.03 },
  });
  const go = (href: string) => (e: React.MouseEvent) => { e.preventDefault(); scrollToSection(href.slice(1)); };
  const words = hero.title.toUpperCase().split(' ');
  let n = 0;

  return (
    <section id="top" data-bg="hero" data-theme="dark" tabIndex={-1} className="relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-4 pb-24 pt-[calc(env(safe-area-inset-top)+7rem)] text-center outline-none md:px-6 md:pt-32">

      <h1 className="max-w-6xl">
        <span className="sr-only">{hero.script} {hero.title}</span>
        <motion.span
          aria-hidden="true"
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: dur.slow, ease: ease.out }}
          className="t-script relative z-0 -mb-[0.12em] block text-[clamp(3.15rem,16.1vw,10.5rem)] text-flame"
        >
          {hero.script}
        </motion.span>
        <span aria-hidden="true" className="t-display relative z-[1] flex flex-wrap justify-center gap-x-[0.3em] text-cream">
          {words.map((w) => (
            <span key={w} className="inline-flex overflow-hidden">
              {w.split('').map((c) => <motion.span key={n} className="inline-block" {...letter(n++)}>{c}</motion.span>)}
            </span>
          ))}
        </span>
      </h1>

      <motion.div initial={{ opacity: 0, y: reduce ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.base, ease: ease.out, delay: dur.slow }} className="mt-8 max-w-xl">
        <p className="t-h3 text-cream">{hero.tagline}</p>
        <p className="t-body mt-3 text-cream/70">{hero.subline}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:mt-10 sm:flex-row">
          <a href={hero.primaryCta.href} onClick={go(hero.primaryCta.href)} data-cursor="button" className="btn-l-primary">
            {hero.primaryCta.label}
          </a>
          <a href={hero.secondaryCta.href} onClick={go(hero.secondaryCta.href)} data-cursor="button" className="btn-l-secondary">
            {hero.secondaryCta.label}
          </a>
        </div>
      </motion.div>

      <a href="#events" onClick={go('#events')} aria-label="Scroll to upcoming events" className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-full text-ash">
        <motion.span animate={reduce ? undefined : { y: [0, 6, 0] }} transition={{ duration: dur.slow * 2, repeat: Infinity, ease: ease.inOut }}>
          <ChevronDown className="h-6 w-6" />
        </motion.span>
      </a>
    </section>
  );
}
