/**
 * The landing palette as JS values, for things CSS classes can't reach (framer-motion
 * colour animations, SVG fills). Must mirror the @theme block in index.css.
 */
export const palette = {
  midnight: '#0B0B0D',
  cream: '#F6E9CE',
  /** Retired colours, aliased to cream so older call sites keep working. Use alpha('cream', 0.7) for secondary. */
  ivory: '#F6E9CE',
  ash: '#F6E9CE',
} as const;

/** Alpha version of a palette colour, e.g. alpha('cream', 0.15). */
export const alpha = (c: keyof typeof palette, a: number) =>
  `${palette[c]}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
