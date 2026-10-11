import { useEffect, useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';

type Props = { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; variant?: 'modal' | 'drawer' | 'nav'; size?: 'sm' | 'md' | 'lg'; description?: ReactNode };

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/** Drag the sheet down this far (px), or flick it, to dismiss. */
const DISMISS_PX = 110;
const DISMISS_VELOCITY = 0.6; // px/ms

/**
 * Accessible dialog: focus moves in on open, is trapped while open, returns to the trigger on close; Escape closes.
 * Under 640px both variants are a bottom sheet: full width, top corners rounded, at most 90svh with the body
 * scrolling inside, a drag handle, safe-area padding, and the footer actions stacked full width with the primary
 * one last (nearest the thumb). Swipe the handle/header down, tap the backdrop or press Escape to dismiss.
 * From 640px: `modal` is a centred dialog, `drawer` slides from the right (`size="lg"` widens it from lg for
 * two-column forms). `nav` is a full-height panel on the left at every width (the Control Room menu), with no swipe.
 */
export function Modal({ open, onClose, title, children, footer, variant = 'modal', size = 'md', description }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<Element | null>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const ids = useId();
  // Callers pass inline onClose arrows; keep the latest in a ref so a parent re-render (e.g. a background
  // refetch) doesn't re-run the open effect, which would yank focus back to the first control mid-typing.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const all = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    // Land on the first real control, not the Close button, so forms are ready to type into. On a phone that
    // would pop the keyboard over half the sheet, so there the panel itself takes focus.
    const touch = window.matchMedia('(pointer: coarse)').matches;
    (touch ? panel.current : all.find((el) => el.getAttribute('aria-label') !== 'Close') ?? all[0] ?? panel.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && (document.activeElement === a || document.activeElement === panel.current)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; (restore.current as HTMLElement | null)?.focus?.({ preventScroll: true }); };
  }, [open]);

  // Swipe-to-dismiss, phones only: the panel follows the finger down (transform only) and springs back if released early.
  const sheet = () => window.matchMedia('(max-width: 639px)').matches;
  const onDown = (e: ReactPointerEvent) => {
    if (variant === 'nav' || e.pointerType === 'mouse' || !sheet() || (e.target as HTMLElement).closest('button')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current; if (!d || !panel.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    panel.current.style.transition = 'none';
    panel.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onUp = () => {
    const d = drag.current; drag.current = null; const p = panel.current;
    if (!d || !p) return;
    const v = d.dy / Math.max(1, performance.now() - d.t);
    p.style.transition = 'transform 200ms var(--ease-out)';
    if (d.dy > DISMISS_PX || (d.dy > 30 && v > DISMISS_VELOCITY)) { p.style.transform = 'translateY(100%)'; window.setTimeout(() => closeRef.current(), 180); }
    else p.style.transform = '';
  };

  if (!open) return null;
  const width = size === 'sm' ? 'sm:max-w-sm' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md';
  // Under sm both variants share the sheet shape; they only differ from sm up.
  const shape = variant === 'nav'
    ? 'inset-y-0 left-0 h-full w-[min(18rem,85vw)] rounded-r-[var(--radius-xl)]'
    : variant === 'drawer'
    ? `sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:h-full sm:w-full sm:max-w-md ${size === 'lg' ? 'lg:max-w-2xl' : ''} sm:rounded-none sm:rounded-l-[var(--radius-xl)]`
    : `sm:relative sm:inset-auto sm:w-full ${width} sm:max-h-[90dvh] sm:rounded-[var(--radius-xl)]`;
  const base = variant === 'nav' ? '' : 'inset-x-0 bottom-0 max-h-[90svh] rounded-t-[var(--radius-xl)]';
  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-midnight/70 p-0 sm:items-center sm:p-4 fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={`${ids}-title`} aria-describedby={description ? `${ids}-desc` : undefined} tabIndex={-1} data-variant={variant}
        className={`${variant === 'nav' ? 'slide-in-left' : 'sheet-panel'} glass fixed flex flex-col overflow-hidden outline-none ${base} ${shape}`}>
        <div className="touch-none select-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {variant !== 'nav' && <span className="sheet-handle" aria-hidden />}
          <div className="flex items-start justify-between gap-3 border-b border-border py-3 pl-5 pr-3 sm:py-4">
            <div className="min-w-0 pt-2.5"><h2 id={`${ids}-title`} className="t-section">{title}</h2>{description && <p id={`${ids}-desc`} className="t-caption mt-0.5">{description}</p>}</div>
            <IconButton label="Close" onClick={onClose} className="shrink-0"><X className="size-4" aria-hidden /></IconButton>
          </div>
        </div>
        <div className={`flex-1 overflow-y-auto overscroll-contain px-5 py-4 scrollbar-thin ${footer ? '' : 'pb-safe'}`}>{children}</div>
        {footer && <div className="pb-safe flex flex-col gap-2 border-t border-border px-5 pt-3 [&>*]:w-full sm:flex-row sm:flex-wrap sm:justify-end sm:pb-3 sm:[&>*]:w-auto">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
