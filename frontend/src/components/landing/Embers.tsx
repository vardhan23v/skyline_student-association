import { useEffect, useRef } from 'react';

/**
 * Sparse rising embers on one fixed canvas: the "fire" layer of the background.
 * Cheap by design: ~36 sparks (16 on phones), each a pre-rendered glow sprite drawn with
 * additive blending; device pixel ratio capped at 1.5; paused while the tab is hidden;
 * not rendered at all with prefers-reduced-motion.
 */
type Spark = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; seed: number };

const SPRITE = 64;

function makeSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
  grad.addColorStop(0, 'rgba(255, 236, 200, 1)'); // white-hot core
  grad.addColorStop(0.18, 'rgba(255, 170, 90, 0.9)');
  grad.addColorStop(0.45, 'rgba(255, 107, 60, 0.35)'); // flame
  grad.addColorStop(1, 'rgba(255, 80, 40, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, SPRITE, SPRITE);
  return c;
}

export function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const sprite = makeSprite();
    let w = 0, h = 0, raf = 0, last = performance.now();
    const count = window.matchMedia('(max-width: 768px)').matches ? 16 : 36;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const spawn = (s: Partial<Spark> = {}): Spark => {
      const max = 6 + Math.random() * 8; // seconds
      return {
        // Most sparks rise from the lower third; a few start anywhere so the screen is never empty.
        x: Math.random() * w,
        y: Math.random() < 0.8 ? h * (0.7 + Math.random() * 0.35) : Math.random() * h,
        vx: (Math.random() - 0.5) * 12,
        vy: -(14 + Math.random() * 32),
        r: 1 + Math.random() * 2.6,
        life: 0,
        max,
        seed: Math.random() * 1000,
        ...s,
      };
    };

    resize();
    const sparks = Array.from({ length: count }, () => spawn({ life: Math.random() * 6 }));

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        s.life += dt;
        if (s.life > s.max || s.y < -20) { sparks[i] = spawn(); continue; }
        // Rise with a slow sideways wander, like heat carrying them.
        s.vx += Math.sin((now / 1000) * 0.8 + s.seed) * 4 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const t = s.life / s.max;
        const fade = Math.min(1, t * 4) * (1 - t); // ease in, burn out
        const flicker = 0.7 + 0.3 * Math.sin(now / 90 + s.seed);
        const size = s.r * 6 * (1 - t * 0.5);
        ctx.globalAlpha = Math.max(0, fade * flicker * 0.85);
        ctx.drawImage(sprite, s.x - size / 2, s.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); }
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
