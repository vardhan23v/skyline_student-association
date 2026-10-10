import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';
import type { Stat } from '../../data/landing';
import { dur, ease } from '../../lib/motion';

const fmt = (n: number, decimals = 0) => n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Counts up from zero the first time it scrolls into view. */
export function StatCounter({ stat }: { stat: Stat }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) { setValue(stat.value); return; }
    const c = animate(0, stat.value, { duration: dur.slow * 2, ease: ease.out, onUpdate: setValue });
    return () => c.stop();
  }, [inView, reduce, stat.value]);
  const final = `${stat.prefix ?? ''}${fmt(stat.value, stat.decimals)}${stat.suffix ?? ''}`;
  return (
    <div className="border-t border-cream/20 pt-5">
      <p ref={ref} className="t-h2 whitespace-nowrap tabular-nums text-cream">
        <span aria-hidden="true">{stat.prefix}{fmt(value, stat.decimals)}{stat.suffix}</span>
        <span className="sr-only">{final}</span>
      </p>
      <p className="t-label mt-2 text-cream/70">{stat.label}</p>
    </div>
  );
}
