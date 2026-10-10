import { useEffect, useRef, useState } from 'react';

/**
 * Cursor-following media preview. Any element with `data-cursor-media="Label"` reveals a small
 * card that trails the pointer with a spring-ish lerp. It plays /media/preview.mp4 when that file
 * exists; otherwise it renders an animated skyline on a canvas so the effect still reads.
 * Disabled for coarse pointers (touch) and when the user prefers reduced motion.
 */
export function CursorMedia() {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [videoOk, setVideoOk] = useState(true);
  const enabled = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!enabled) return;
    const el = box.current!;
    let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, raf = 0, active = false;
    const tick = () => {
      x += (tx - x) * 0.16; y += (ty - y) * 0.16;
      el.style.transform = `translate3d(${x + 22}px, ${y + 22}px, 0) rotate(${(tx - x) * 0.04}deg)`;
      raf = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      tx = e.clientX; ty = e.clientY;
      const t = (e.target as Element | null)?.closest?.('[data-cursor-media]') as HTMLElement | null;
      const next = t?.dataset.cursorMedia ?? null;
      if (next !== (active ? el.dataset.label ?? null : null)) { el.dataset.label = next ?? ''; setLabel(next); active = !!next; }
      if (!raf) { x = tx; y = ty; raf = requestAnimationFrame(tick); }
    };
    const leave = () => { setLabel(null); active = false; };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('mouseleave', leave);
    return () => { window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('mouseleave', leave); cancelAnimationFrame(raf); };
  }, [enabled]);

  // Fallback animation: skyline bars breathing, only while visible and only when no video.
  useEffect(() => {
    if (!enabled || videoOk || !label || !canvas.current) return;
    const c = canvas.current, ctx = c.getContext('2d')!; let raf = 0; const t0 = performance.now();
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#298DFF';
    const draw = (now: number) => {
      const t = (now - t0) / 1000; const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#05080e'; ctx.fillRect(0, 0, W, H);
      const n = 14, bw = W / n;
      for (let i = 0; i < n; i++) { const h = H * (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 0.9))); ctx.fillStyle = i % 3 === 0 ? accent : i % 3 === 1 ? '#182236' : '#364158'; ctx.fillRect(i * bw + 2, H - h, bw - 4, h); }
      ctx.fillStyle = '#F5F7FA'; ctx.beginPath(); ctx.arc(W * (0.5 + 0.35 * Math.sin(t * 0.5)), H * 0.22, 4, 0, Math.PI * 2); ctx.fill();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [enabled, videoOk, label]);

  if (!enabled) return null;
  return (
    <div ref={box} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[var(--z-nav)] w-56 origin-top-left will-change-transform"
      style={{ opacity: label ? 1 : 0, scale: label ? '1' : '0.85', transition: `opacity var(--dur-base) var(--ease-out), scale var(--dur-base) var(--ease-out)` }}>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-float)]">
        <div className="relative aspect-[16/10] bg-surface-sunken">
          {videoOk ? <video className="h-full w-full object-cover" src="/media/preview.mp4" muted loop playsInline autoPlay preload="metadata" onError={() => setVideoOk(false)} /> : <canvas ref={canvas} width={448} height={280} className="h-full w-full" />}
          <span className="absolute left-2 top-2 badge bg-background/70 text-text-secondary backdrop-blur">preview</span>
        </div>
        {label && <div className="truncate px-3 py-2 text-xs font-medium">{label}</div>}
      </div>
    </div>
  );
}
