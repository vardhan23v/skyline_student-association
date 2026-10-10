import { useEffect, useRef, useState } from 'react';

type Options = { ease?: number; maxTilt?: number; enabled?: boolean };

/** True on devices with a precise pointer and no reduced-motion preference. */
export function useFinePointer() {
  const query = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setOk(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return ok;
}

/**
 * Moves the referenced element toward the pointer with a lerp every animation frame
 * and tilts it by horizontal velocity. Writes `transform` directly, so React never re-renders per frame.
 */
export function useCursorFollow<T extends HTMLElement>({ ease = 0.12, maxTilt = 10, enabled = true }: Options = {}) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled) return;
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = { ...target };
    let tilt = 0;
    let started = false;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX; target.y = e.clientY;
      if (!started) { pos.x = target.x; pos.y = target.y; started = true; }
    };
    const tick = () => {
      const dx = (target.x - pos.x) * ease;
      pos.x += dx; pos.y += (target.y - pos.y) * ease;
      tilt += (Math.max(-maxTilt, Math.min(maxTilt, dx * 0.6)) - tilt) * 0.15;
      if (ref.current) ref.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%) rotate(${tilt.toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, [ease, maxTilt, enabled]);
  return ref;
}
