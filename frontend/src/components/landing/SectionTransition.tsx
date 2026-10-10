import { motion, useReducedMotion } from 'framer-motion';
import { dur, ease } from '../../lib/motion';

/**
 * Section-to-section transition: as a section scrolls in, it rises 32px and fades in while a
 * cream hairline draws across its top edge and fades back to the divider. Only opacity and
 * transform animate (compositor-only, no repaint); the transform is removed when done so
 * fixed/sticky children behave. Reduced motion: a plain fade.
 */
export function SectionTransition({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    // Observe the outer box (stable geometry); animate the inner one.
    <motion.div className="relative" initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.12 }}>
      <motion.div
        variants={reduce
          ? { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: dur.base } } }
          : {
              // Opacity + transform only: both run on the compositor. Animating clip-path repainted
              // the whole section (six parallax photos in "past") every frame and stuttered.
              hidden: { opacity: 0, y: 32 },
              shown: {
                opacity: 1,
                y: 0,
                transition: { duration: dur.slow, ease: ease.out },
                transitionEnd: { transform: 'none' },
              },
            }}
      >
        {children}
      </motion.div>
      {!reduce && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px origin-left bg-cream"
          variants={{
            hidden: { scaleX: 0, opacity: 1 },
            shown: { scaleX: 1, opacity: [1, 1, 0], transition: { duration: dur.slow * 1.6, ease: ease.inOut, times: [0, 0.6, 1] } },
          }}
        />
      )}
    </motion.div>
  );
}
