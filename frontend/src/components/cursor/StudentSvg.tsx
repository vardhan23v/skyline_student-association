import { motion, type MotionValue } from 'framer-motion';
import type { CursorMode } from './useCursorState';
import { dur, ease } from '../../lib/motion';
import { palette } from '../../lib/palette';

type Props = {
  mode: CursorMode;
  /** Stroke colour for limbs: ivory on dark sections, midnight on light ones. */
  ink: string;
  legL: MotionValue<number>;
  legR: MotionValue<number>;
  tassel: MotionValue<number>;
};

const { midnight, crimson, ivory } = palette;
const once = { duration: dur.slow, ease: ease.inOut };
/** Rotate SVG parts around a joint, not their centre. */
const joint = (x: number, y: number) => ({ originX: x, originY: y });

/**
 * 44×44 flat student: mortarboard, backpack, book. Parts are separate groups so the
 * cursor can animate them. Mounted fresh per hover target, so gestures play once.
 */
export function StudentSvg({ mode, ink, legL, legR, tassel }: Props) {
  const armR =
    mode === 'link' ? { rotate: [0, -130, -95, -130, 0] }
    : mode === 'join' ? { rotate: [0, -150, -150, 0] }
    : mode === 'view' ? { rotate: -70 }
    : { rotate: 0 };
  const armL = mode === 'join' ? { rotate: [0, 150, 150, 0] } : { rotate: 0 };
  const cap = mode === 'link' ? { rotate: [0, -8, 0] } : { rotate: 0 };

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" strokeLinecap="round" strokeLinejoin="round" overflow="visible">
      {/* backpack sits behind the torso */}
      <rect x="12" y="19" width="11" height="13" rx="3" fill={crimson} />
      <motion.g style={{ rotate: legL, ...joint(0.5, 0) }}>
        <line x1="19" y1="32" x2="18" y2="41" stroke={ink} strokeWidth="2" />
      </motion.g>
      <motion.g style={{ rotate: legR, ...joint(0.5, 0) }}>
        <line x1="25" y1="32" x2="26" y2="41" stroke={ink} strokeWidth="2" />
      </motion.g>
      <rect x="15" y="19" width="14" height="15" rx="6" fill={ivory} stroke={midnight} strokeWidth="2" />
      <motion.g initial={{ rotate: 0 }} animate={armL} transition={once} style={joint(1, 0)}>
        <line x1="16" y1="22" x2="11" y2="30" stroke={ink} strokeWidth="2" />
      </motion.g>
      <motion.g initial={{ rotate: 0 }} animate={armR} transition={once} style={joint(0, 0)}>
        <line x1="28" y1="22" x2="33" y2="30" stroke={ink} strokeWidth="2" />
        <motion.g initial={{ opacity: 0, scale: 0.4 }} animate={mode === 'view' ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }} transition={{ duration: dur.fast }}>
          <rect x="30" y="28" width="8" height="10" rx="1" fill={ivory} stroke={midnight} strokeWidth="1" />
          <rect x="30" y="28" width="2" height="10" fill={crimson} />
        </motion.g>
      </motion.g>
      <circle cx="22" cy="13" r="6.5" fill={ivory} stroke={midnight} strokeWidth="2" />
      <circle cx="20" cy="13.5" r="0.75" fill={midnight} />
      <circle cx="24.5" cy="13.5" r="0.75" fill={midnight} />
      <motion.g initial={{ rotate: 0 }} animate={cap} transition={once} style={joint(0.5, 1)}>
        <polygon points="22,2.5 31.5,6 22,9.5 12.5,6" fill={crimson} />
        <rect x="17.5" y="7" width="9" height="2.5" rx="0.5" fill={crimson} />
        <motion.g style={{ rotate: tassel, ...joint(0, 0) }}>
          <path d="M22 6 L29.5 6.8 L29.5 11.5" stroke={crimson} strokeWidth="1.5" />
        </motion.g>
      </motion.g>
    </svg>
  );
}
