import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';

type Props = { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; variant?: 'modal' | 'drawer'; size?: 'sm' | 'md' | 'lg'; description?: ReactNode };

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: focus moves in on open, is trapped while open, returns to the
 * trigger on close; Escape closes. `drawer` slides from the right (bottom sheet on phones).
 */
export function Modal({ open, onClose, title, children, footer, variant = 'modal', size = 'md', description }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const all = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    // Land on the first real control, not the Close button, so forms are ready to type into.
    (all.find((el) => el.getAttribute('aria-label') !== 'Close') ?? all[0] ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; (restore.current as HTMLElement | null)?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  const shape = variant === 'drawer'
    ? `fixed inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[var(--radius-xl)] sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:h-full sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-[var(--radius-xl)] slide-up sm:slide-in-right`
    : `relative w-full ${width} max-h-[90dvh] rounded-[var(--radius-xl)] fade-in`;
  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby={description ? 'dlg-desc' : undefined} tabIndex={-1} className={`glass flex flex-col overflow-hidden outline-none ${shape}`}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0"><h2 id="dlg-title" className="t-section">{title}</h2>{description && <p id="dlg-desc" className="t-caption mt-0.5">{description}</p>}</div>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1"><X className="size-4" aria-hidden /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3 safe-bottom">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
