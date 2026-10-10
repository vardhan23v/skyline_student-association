import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { GalleryPhoto } from '../../data/landing';
import { lockScroll } from '../../hooks/useSmoothScroll';
import { dur } from '../../lib/motion';

type Props = { photos: GalleryPhoto[]; index: number | null; onChange: (i: number | null) => void };

/** Modal photo viewer: Esc closes, ← → navigate, swipe on touch, focus trapped and restored. */
export function Lightbox({ photos, index, onChange }: Props) {
  const open = index !== null;
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const step = (d: number) => index !== null && onChange((index + d + photos.length) % photos.length);

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    lockScroll(true);
    closeBtn.current?.focus();
    return () => { lockScroll(false); trigger?.focus(); };
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onChange(null);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'Tab') {
      const f = dialog.current?.querySelectorAll<HTMLElement>('button');
      if (!f?.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  const photo = index !== null ? photos[index] : null;
  // Portalled to <body> so ancestor transforms/clips never trap the fixed overlay.
  return createPortal(
    <AnimatePresence>
      {open && photo && (
        <motion.div
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${index! + 1} of ${photos.length}: ${photo.alt}`}
          onKeyDown={onKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="landing fixed inset-0 z-[80] flex flex-col bg-midnight/95 backdrop-blur-md"
          onClick={(e) => { if (e.target === e.currentTarget) onChange(null); }}
        >
          <div className="flex items-center justify-between p-4">
            <p className="t-label text-cream/70" aria-live="polite">{index! + 1} / {photos.length}</p>
            <button ref={closeBtn} type="button" onClick={() => onChange(null)} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full border border-cream/15 text-cream hover:border-cream"><X className="h-5 w-5" /></button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-6" onClick={(e) => { if (e.target === e.currentTarget) onChange(null); }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.figure
                key={index}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: dur.fast }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.4}
                onDragEnd={(_, info) => { if (info.offset.x < -60) step(1); else if (info.offset.x > 60) step(-1); }}
                className="flex max-h-full max-w-5xl cursor-grab flex-col items-center active:cursor-grabbing"
              >
                <img src={photo.image} alt={photo.alt} draggable={false} className="max-h-[72svh] w-auto rounded-2xl object-contain" />
                <figcaption className="t-body mt-4 text-center text-cream">{photo.alt}</figcaption>
              </motion.figure>
            </AnimatePresence>
            <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-midnight/60 text-cream hover:text-cream sm:left-6"><ChevronLeft className="h-6 w-6" /></button>
            <button type="button" onClick={() => step(1)} aria-label="Next photo" className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-midnight/60 text-cream hover:text-cream sm:right-6"><ChevronRight className="h-6 w-6" /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
