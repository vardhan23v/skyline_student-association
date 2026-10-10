import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';
import type { Stat } from '../../data/landing';

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
    const c = animate(0, stat.value, { duration: 1.8, ease: [0.22, 1, 0.36, 1], onUpdate: setValue });
    return () => c.stop();
  }, [inView, reduce, stat.value]);
  const final = `${stat.prefix ?? ''}${fmt(stat.value, stat.decimals)}${stat.suffix ?? ''}`;
  return (
    <div className="border-t border-ash/20 pt-5">
      <p ref={ref} className="text-4xl font-extrabold tabular-nums text-ivory sm:text-5xl">
        <span aria-hidden="true">{stat.prefix}{fmt(value, stat.decimals)}{stat.suffix}</span>
        <span className="sr-only">{final}</span>
      </p>
      <p className="label-wide mt-2 text-ivory/65">{stat.label}</p>
    </div>
  );
}
