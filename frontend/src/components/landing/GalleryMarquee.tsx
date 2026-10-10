import { useState } from 'react';
import { gallery, type GalleryPhoto } from '../../data/landing';
import { Lightbox } from './Lightbox';
import { SectionHeading } from './SectionHeading';

/** One marquee row. The list is rendered twice for a seamless loop; the copy is hidden from AT and tab order. */
function Row({ photos, offset, reverse, onOpen }: { photos: GalleryPhoto[]; offset: number; reverse?: boolean; onOpen: (i: number) => void }) {
  return (
    <div className="marquee-row no-scrollbar overflow-hidden py-2">
      <ul className="marquee-track" data-reverse={reverse || undefined}>
        {[0, 1].map((copy) =>
          photos.map((p, i) => (
            <li key={`${copy}-${i}`} aria-hidden={copy === 1 || undefined} className="shrink-0">
              <button
                type="button"
                tabIndex={copy === 1 ? -1 : undefined}
                data-cursor="view"
                onClick={(e) => { e.currentTarget.focus(); onOpen(offset + i); }}
                className="group block overflow-hidden rounded-2xl border border-cream/20"
              >
                <img src={p.image} alt={copy === 1 ? '' : p.alt} width={720} height={540} loading="lazy" decoding="async" className="h-40 w-[13.5rem] object-cover transition-transform duration-500 group-hover:scale-105 sm:h-56 sm:w-[19rem]" />
              </button>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

export function GalleryMarquee() {
  const [open, setOpen] = useState<number | null>(null);
  const half = Math.ceil(gallery.length / 2);
  return (
    <section id="gallery" data-bg="gallery" data-theme="dark" tabIndex={-1} aria-labelledby="gallery-h" className="overflow-hidden border-t border-cream/20 py-24 outline-none sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <SectionHeading id="gallery-h" script="moments" title="Gallery" />
        <p className="t-body mt-4 text-cream/70">Hover to pause. Select a photo to open it.</p>
      </div>
      <div className="mt-12 space-y-4">
        <Row photos={gallery.slice(0, half)} offset={0} onOpen={setOpen} />
        <Row photos={gallery.slice(half)} offset={half} reverse onOpen={setOpen} />
      </div>
      <Lightbox photos={gallery} index={open} onChange={setOpen} />
    </section>
  );
}
