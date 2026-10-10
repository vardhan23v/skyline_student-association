/** Motion tokens for the landing page. Import these; don't write ad-hoc easings or durations. */
export const ease = { out: [0.22, 1, 0.36, 1], inOut: [0.65, 0, 0.35, 1] } as const;
export const dur = { fast: 0.25, base: 0.6, slow: 1.0 } as const;
export const spring = {
  cursor: { stiffness: 500, damping: 40, mass: 0.6 }, // dot: near-instant
  follower: { stiffness: 170, damping: 22, mass: 0.9 }, // student: soft lag
} as const;
