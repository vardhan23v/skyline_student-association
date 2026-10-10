/**
 * The site palette as JS values, for things CSS classes can't reach (framer-motion colour animations, SVG and
 * chart fills). Must mirror the tokens in index.css (:root and the landing @theme block).
 */
export const palette = {
  midnight: '#0B0B0D',
  cream: '#F6E9CE',
  /** Fills, focus rings, selection. Never text (3.2:1 on midnight). */
  crimson: '#C1121F',
  /** The red used for text (script accents, links): 7.0:1 on midnight. */
  flame: '#FF6B5E',
  /** Status colours, toned to the palette. */
  success: '#8FD0A4',
  warning: '#E8B86A',
  danger: '#FF7A70',
  /** Retired colours, aliased to cream so older call sites keep working. Use alpha('cream', 0.7) for secondary. */
  ivory: '#F6E9CE',
  ash: '#F6E9CE',
} as const;

/** Alpha version of a palette colour, e.g. alpha('cream', 0.15). */
export const alpha = (c: keyof typeof palette, a: number) =>
  `${palette[c]}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
