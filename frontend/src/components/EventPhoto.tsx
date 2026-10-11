import type { Event } from '@/api/types';

/**
 * Files made by `npm run photos:prepare` for a photo the site serves (/media/…/<name>.jpg): the 1600px JPEG and WebP,
 * 480px phone copies of both, and a tiny blurred WebP shown while the photo loads. An https URL is used as it is.
 */
export function eventImage(url: string) {
  const local = /^\/media\/[\w./-]+\.jpg$/.test(url);
  const v = (suffix: string) => url.replace(/\.jpg$/, suffix);
  return local
    ? { src: url, srcSet: `${v('-480.jpg')} 480w, ${url} 1600w`, webp: `${v('-480.webp')} 480w, ${v('.webp')} 1600w`, blur: v('-blur.webp') }
    : { src: url, srcSet: undefined, webp: undefined, blur: undefined };
}

type Props = { event: Pick<Event, 'image_url' | 'image_alt' | 'title'>; className?: string; imgClassName?: string; sizes?: string; eager?: boolean };

/** An event's cover photo, cropped to fill its box. Renders nothing when the event has no photo. */
export function EventPhoto({ event, className = '', imgClassName = '', sizes = '(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw', eager = false }: Props) {
  if (!event.image_url) return null;
  const img = eventImage(event.image_url);
  return (
    <div className={`relative overflow-hidden bg-surface-elevated bg-cover bg-center ${className}`} style={img.blur ? { backgroundImage: `url(${img.blur})` } : undefined}>
      <picture>
        {img.webp && <source type="image/webp" srcSet={img.webp} sizes={sizes} />}
        <img src={img.src} srcSet={img.srcSet} sizes={img.srcSet ? sizes : undefined} alt={event.image_alt || ''} loading={eager ? 'eager' : 'lazy'} decoding="async"
          width={1600} height={1000} className={`absolute inset-0 h-full w-full object-cover ${imgClassName}`} />
      </picture>
    </div>
  );
}
