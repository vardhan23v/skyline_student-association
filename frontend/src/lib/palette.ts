/**
 * The landing palette as JS values, for things CSS classes can't reach (framer-motion
 * colour animations, SVG fills). Must mirror the @theme block in index.css.
 */
export const palette = {
  midnight: '#0B0B0D',
  crimson: '#C1121F',
  ivory: '#F5F1ED',
  ash: '#777780',
} as const;

/** Alpha version of a palette colour, e.g. alpha('crimson', 0.15). */
export const alpha = (c: keyof typeof palette, a: number) =>
  `${palette[c]}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
