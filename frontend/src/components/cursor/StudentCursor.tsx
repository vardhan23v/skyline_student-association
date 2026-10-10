import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useFinePointer } from '../../hooks/useCursorFollow';
import { dur, ease, spring } from '../../lib/motion';
import { alpha, palette } from '../../lib/palette';
import { StudentSvg } from './StudentSvg';
import { getCursorState, resolveCursor, setCursorState, useCursorState, type CursorMode, type CursorTheme } from './useCursorState';

/** Student sits this far down-right of the pointer hotspot (centre of the 44px figure). */
const OFFSET = 18 + 22;
const IDLE_MS = 1200;
const MAGNET_PX = 6;
/** Spec'd micro-timings (seconds): window leave/return fade, mouse-down squash. */
const FADE = 0.2;
const PRESS = 0.12;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Two-layer cursor for the landing page: a precise cream dot on the hotspot, plus a
 * lagging student and a context ring/label. Elements opt in with `data-cursor` and
 * `data-cursor-label`. Renders nothing on touch devices or with reduced motion.
 */
export function StudentCursor() {
  const enabled = useFinePointer();
  if (!enabled || typeof document === 'undefined') return null;
  return createPortal(<CursorLayer />, document.body);
}

function ringStyle(mode: CursorMode, theme: CursorTheme, label: string | null) {
  const light = theme === 'light';
  const hidden = { width: 12, height: 12, opacity: 0, borderColor: alpha('ash', 0), backgroundColor: alpha('ash', 0), color: palette.midnight };
  switch (mode) {
    case 'link':
      return { ...hidden, width: 36, height: 36, opacity: 1, borderColor: light ? alpha('midnight', 0.6) : alpha('cream', 0.7) };
    case 'button':
      return light
        ? { ...hidden, width: 56, height: 56, opacity: 1, borderColor: alpha('midnight', 0.6), backgroundColor: alpha('midnight', 0.12) }
        : { ...hidden, width: 56, height: 56, opacity: 1, borderColor: palette.cream, backgroundColor: alpha('cream', 0.15) };
    case 'view':
    case 'join': {
      const width = Math.max(96, (label?.length ?? 4) * 13 + 40);
      if (light) return { width, height: 48, opacity: 1, borderColor: palette.midnight, backgroundColor: palette.midnight, color: palette.cream };
      return mode === 'view'
        ? { width, height: 48, opacity: 1, borderColor: palette.cream, backgroundColor: palette.cream, color: palette.midnight }
        : { width, height: 48, opacity: 1, borderColor: palette.cream, backgroundColor: palette.cream, color: palette.midnight };
    }
    default:
      return hidden;
  }
}

function studentPose(mode: CursorMode) {
  switch (mode) {
    case 'merch':
    case 'text':
      return { scale: 0, y: 0, scaleY: 1 };
    case 'view':
      return { scale: 0.85, y: 0, scaleY: 1 };
    case 'button':
      return { scale: 1, y: [0, -6, 0, 0], scaleY: [1, 1, 0.92, 1] };
    default:
      return { scale: 1, y: 0, scaleY: 1 };
  }
}

function CursorLayer() {
  const { mode, label, theme, visible, pressed, nonce } = useCursorState();

  const mx = useMotionValue(-100);
  const my = useMotionValue(-100);
  const dotX = useSpring(mx, spring.cursor);
  const dotY = useSpring(my, spring.cursor);
  const folX = useSpring(mx, spring.follower);
  const folY = useSpring(my, spring.follower);
  const studentX = useTransform(folX, (v) => v + OFFSET);
  const studentY = useTransform(folY, (v) => v + OFFSET);
  // Driven every frame from the rAF loop; never touch React state.
  const lean = useMotionValue(0);
  const bob = useMotionValue(0);
  const legL = useMotionValue(0);
  const legR = useMotionValue(0);
  const tassel = useMotionValue(0);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('has-student-cursor');

    let lastMove = performance.now();
    let hovered: Element | null = null;
    // Magnetic CTA: cached rect (read on enter/scroll only), eased offset written in rAF.
    let magnet: { el: HTMLElement; rect: DOMRect; tx: number; ty: number; x: number; y: number } | null = null;
    const releasing: { el: HTMLElement; x: number; y: number }[] = [];

    const applyTarget = (el: Element | null) => {
      const r = resolveCursor(el);
      const changed = r.target !== hovered;
      hovered = r.target;
      setCursorState({ mode: r.mode, label: r.label, theme: r.theme, ...(changed ? { nonce: getCursorState().nonce + 1 } : {}) });
      if (magnet && magnet.el !== r.magnet) { releasing.push({ el: magnet.el, x: magnet.x, y: magnet.y }); magnet = null; }
      if (r.magnet && !magnet) magnet = { el: r.magnet, rect: r.magnet.getBoundingClientRect(), tx: 0, ty: 0, x: 0, y: 0 };
    };

    const aimMagnet = (x: number, y: number) => {
      if (!magnet) return;
      const { rect } = magnet;
      magnet.tx = clamp((x - (rect.left + rect.width / 2)) / (rect.width / 2), -1, 1) * MAGNET_PX;
      magnet.ty = clamp((y - (rect.top + rect.height / 2)) / (rect.height / 2), -1, 1) * MAGNET_PX;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      mx.set(e.clientX); my.set(e.clientY);
      if (!getCursorState().visible) {
        // Returning to the window: appear at the pointer instead of flying in.
        dotX.jump(e.clientX); dotY.jump(e.clientY); folX.jump(e.clientX); folY.jump(e.clientY);
        setCursorState({ visible: true });
      }
      lastMove = performance.now();
      aimMagnet(e.clientX, e.clientY);
    };
    const onOver = (e: PointerEvent) => { if (e.pointerType === 'mouse') applyTarget(e.target as Element); };
    const onLeave = () => setCursorState({ visible: false, pressed: false });
    const onDown = (e: PointerEvent) => { if (e.pointerType === 'mouse') setCursorState({ pressed: true }); };
    const onUp = () => setCursorState({ pressed: false });

    // Scrolling moves content under a still pointer: re-resolve once per frame at most.
    let scrollQueued = false;
    const onScroll = () => {
      if (scrollQueued || !getCursorState().visible) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        applyTarget(document.elementFromPoint(mx.get(), my.get()));
        if (magnet) { magnet.rect = magnet.el.getBoundingClientRect(); aimMagnet(mx.get(), my.get()); }
      });
    };

    let raf = 0;
    let last = performance.now();
    let phase = 0, walk = 0, idle = 0, tilt = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const vx = folX.getVelocity();
      const speed = Math.hypot(vx, folY.getVelocity());
      // Lean into travel; tassel trails the other way.
      tilt += (clamp(vx * 0.05, -12, 12) - tilt) * 0.2;
      // Walk cycle: stride and cadence scale with pointer speed.
      walk += (Math.min(speed / 300, 1) - walk) * 0.15;
      phase += dt * (4 + Math.min(speed / 60, 16));
      // Idle after 1.2s still: gentle bob and tassel sway on a 3s loop.
      idle += ((now - lastMove > IDLE_MS ? 1 : 0) - idle) * 0.05;
      const sway = Math.sin((now / 1000) * ((2 * Math.PI) / 3));
      lean.set(tilt);
      legL.set(Math.sin(phase) * 26 * walk);
      legR.set(-Math.sin(phase) * 26 * walk);
      bob.set(sway * 2 * idle);
      tassel.set(-tilt * 1.6 + sway * 12 * idle);

      if (magnet) {
        magnet.x += (magnet.tx - magnet.x) * 0.2; magnet.y += (magnet.ty - magnet.y) * 0.2;
        magnet.el.style.translate = `${magnet.x.toFixed(2)}px ${magnet.y.toFixed(2)}px`;
      }
      for (let i = releasing.length - 1; i >= 0; i--) {
        const m = releasing[i];
        m.x *= 0.8; m.y *= 0.8;
        if (Math.abs(m.x) + Math.abs(m.y) < 0.05) { m.el.style.translate = ''; releasing.splice(i, 1); }
        else m.el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    root.addEventListener('mouseleave', onLeave);
    window.addEventListener('blur', onLeave);
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      root.classList.remove('has-student-cursor');
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      root.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('scroll', onScroll);
      if (magnet) magnet.el.style.translate = '';
      releasing.forEach((m) => { m.el.style.translate = ''; });
      setCursorState({ visible: false, pressed: false, mode: 'default', label: null });
    };
  }, [mx, my, dotX, dotY, folX, folY, lean, bob, legL, legR, tassel]);

  const ring = ringStyle(mode, theme, label);
  const scriptLabel = !!label && label.trim().split(/\s+/).length <= 2;
  const ink = theme === 'light' ? palette.midnight : palette.cream;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] font-[family-name:var(--font-landing)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: visible && mode !== 'text' ? 1 : 0 }}
      transition={{ duration: FADE }}
    >
      {/* Context ring / label, trailing with the follower spring. */}
      <motion.div className="absolute left-0 top-0" style={{ x: folX, y: folY }}>
        <motion.div
          className="flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden whitespace-nowrap rounded-full border"
          initial={false}
          animate={{ ...ring, scale: pressed ? [1, 1.25, 1] : 1 }}
          transition={{ duration: dur.fast, ease: ease.out }}
        >
          {(mode === 'view' || mode === 'join') && label && (
            <span className={scriptLabel ? 't-script text-2xl' : 't-label !text-[0.65rem] font-bold'}>{label}</span>
          )}
        </motion.div>
      </motion.div>

      {/* Student follower. Outer: position + lean + idle bob. Middle: press squash. Inner: per-target pose, remounted to replay. */}
      <motion.div className="absolute left-0 top-0" style={{ x: studentX, y: studentY }}>
        <motion.div className="-translate-x-1/2 -translate-y-1/2" style={{ rotate: lean, y: bob }}>
          <motion.div
            animate={pressed ? { scaleX: 1.05, scaleY: 0.9 } : { scaleX: 1, scaleY: 1 }}
            transition={{ duration: PRESS, ease: ease.out }}
            style={{ originY: 1 }}
          >
            <motion.div
              key={`${mode}-${nonce}`}
              initial={{ scale: 1, y: 0, scaleY: 1 }}
              animate={studentPose(mode)}
              transition={{ duration: mode === 'button' ? dur.base : dur.fast, ease: ease.out }}
              style={{ originY: 1 }}
            >
              <StudentSvg mode={mode} ink={ink} legL={legL} legR={legR} tassel={tassel} />
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Precision dot on the hotspot. */}
      <motion.div className="absolute left-0 top-0" style={{ x: dotX, y: dotY }}>
        <motion.div
          className="-translate-x-1/2 -translate-y-1/2 rounded-full bg-cream"
          initial={false}
          animate={{ width: pressed ? 4 : 6, height: pressed ? 4 : 6 }}
          transition={{ duration: PRESS }}
        />
      </motion.div>
    </motion.div>
  );
}
