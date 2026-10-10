import { motion, useReducedMotion } from 'framer-motion';
import { dur, ease } from '../../lib/motion';

/**
 * Section-to-section transition: as a section scrolls in, it opens from a rounded,
 * slightly inset clip ("curtain") while a crimson hairline draws across its top edge
 * and fades back to the ash divider. No transforms, so anchor offsets, sticky/fixed
 * children and IntersectionObservers stay exact. Reduced motion: a plain fade.
 */
export function SectionTransition({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    // Observe the outer box; animate the inner one (a clipped target never reports as intersecting).
    <motion.div className="relative" initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.12 }}>
      <motion.div
        variants={reduce
          ? { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: dur.base } } }
          : {
              hidden: { opacity: 0, clipPath: 'inset(4% 3% 0% 3% round 32px)' },
              shown: {
                opacity: 1,
                clipPath: 'inset(0% 0% 0% 0% round 0px)',
                transition: { duration: dur.slow, ease: ease.out },
                transitionEnd: { clipPath: 'none' },
              },
            }}
      >
        {children}
      </motion.div>
      {!reduce && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px origin-left bg-crimson"
          variants={{
            hidden: { scaleX: 0, opacity: 1 },
            shown: { scaleX: 1, opacity: [1, 1, 0], transition: { duration: dur.slow * 1.6, ease: ease.inOut, times: [0, 0.6, 1] } },
          }}
        />
      )}
    </motion.div>
  );
}
