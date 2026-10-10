import { motion } from 'framer-motion';
import { dur, ease } from '../../lib/motion';

type Props = { script: string; title: string; id?: string; align?: 'left' | 'center'; className?: string; /** h1 for page headers; sections stay h2. */ as?: 'h1' | 'h2'; /** `md` for app page headers (dashboard, account): smaller than a landing section. */ size?: 'lg' | 'md' };

/** Script accent word paired with a bold, wide-tracked uppercase word: *upcoming* EVENTS. Used by every page header. */
export function SectionHeading({ script, title, id, align = 'left', className = '', as = 'h2', size = 'lg' }: Props) {
  const Tag = as === 'h1' ? motion.h1 : motion.h2;
  return (
    <Tag
      id={id}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15% 0px' }}
      transition={{ duration: dur.base, ease: ease.out }}
      className={`lockup ${size === 'md' ? 't-h2-md' : 't-h2'} text-cream ${align === 'center' ? 'justify-center text-center' : ''} ${className}`}
    >
      <span className="t-script">{script}</span>
      <span className="lockup-sans">{title}</span>
    </Tag>
  );
}

/** Club logo (skyline + student). Decorative next to the "SSA" / club-name text, so alt is empty. */
export function SkylineMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <img
      src="/brand/logo-96.png"
      srcSet="/brand/logo-96.png 1x, /brand/logo-192.png 2x"
      width={96}
      height={96}
      alt=""
      decoding="async"
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
