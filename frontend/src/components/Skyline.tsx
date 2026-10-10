/**
 * Original skyline motif. Stair-stepped bars echo the reference's pixel histograms, but the
 * silhouette is a campus skyline: a clock tower (the "bell") flanked by blocks. Pure SVG, token colours.
 */
export function Skyline({ className = '', animated = false }: { className?: string; animated?: boolean }) {
  const bars = [
    [0, 62, 14], [16, 50, 10], [28, 70, 16], [46, 40, 8], [56, 84, 12], [70, 58, 14], [86, 30, 8], [96, 66, 18], [116, 46, 10], [128, 92, 10], [140, 54, 12], [154, 74, 16], [172, 36, 8], [182, 60, 14], [198, 44, 10], [210, 78, 12], [224, 52, 14], [240, 32, 10],
  ];
  return (
    <svg viewBox="0 0 250 120" className={className} role="img" aria-label="Skyline Student Association skyline mark" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="sky-fade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity="1" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0.35" /></linearGradient>
      </defs>
      {bars.map(([x, h, w], i) => (
        <rect key={i} x={x} y={112 - h} width={w} height={h} fill={i % 3 === 0 ? 'url(#sky-fade)' : i % 3 === 1 ? 'var(--accent)' : 'var(--text-tertiary)'} opacity={i % 3 === 2 ? 0.55 : 1} className={animated ? 'sky-bar' : undefined} style={animated ? { animationDelay: `${i * 40}ms`, transformOrigin: `${x + w / 2}px 112px` } : undefined} />
      ))}
      {/* Clock tower / bell */}
      <rect x="128" y="8" width="10" height="14" fill="var(--text-primary)" />
      <circle cx="133" cy="15" r="2.2" fill="var(--background)" />
      <rect x="131" y="2" width="4" height="6" fill="var(--text-primary)" />
      <rect x="0" y="113" width="250" height="1.5" fill="var(--text-primary)" opacity="0.9" />
    </svg>
  );
}

/** Deterministic cover art for an event (events have no image field). Same id → same composition. */
export function EventArt({ seed, className = '' }: { seed: number; className?: string }) {
  const r = (n: number) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  const cols = 12;
  const heights = Array.from({ length: cols }, (_, i) => 20 + Math.round(r(i) * 60));
  return (
    <svg viewBox="0 0 240 90" className={className} aria-hidden preserveAspectRatio="xMidYMax slice">
      <rect width="240" height="90" fill="var(--surface-sunken)" />
      {heights.map((h, i) => <rect key={i} x={i * 20} y={90 - h} width="18" height={h} fill={i % 4 === (seed % 4) ? 'var(--accent)' : 'var(--surface-elevated)'} />)}
      <circle cx={30 + r(99) * 180} cy={18 + r(7) * 20} r="6" fill="var(--text-primary)" opacity="0.9" />
    </svg>
  );
}
