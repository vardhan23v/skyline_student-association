import { motion } from 'framer-motion';
import { dur, ease } from '../../lib/motion';

type Props = { script: string; title: string; id?: string; align?: 'left' | 'center'; className?: string };

/** Script accent word paired with a bold, wide-tracked uppercase word: *upcoming* EVENTS. */
export function SectionHeading({ script, title, id, align = 'left', className = '' }: Props) {
  return (
    <motion.h2
      id={id}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15% 0px' }}
      transition={{ duration: dur.base, ease: ease.out }}
      className={`lockup t-h2 text-cream ${align === 'center' ? 'justify-center text-center' : ''} ${className}`}
    >
      <span className="t-script">{script}</span>
      <span className="lockup-sans">{title}</span>
    </motion.h2>
  );
}

/** Small skyline mark in currentColor, used by the nav and footer. */
export function SkylineMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="currentColor">
      <rect x="3" y="16" width="5" height="12" rx="1" />
      <rect x="10" y="9" width="5" height="19" rx="1" />
      <rect x="17" y="4" width="5" height="24" rx="1" />
      <rect x="24" y="12" width="5" height="16" rx="1" />
    </svg>
  );
}
