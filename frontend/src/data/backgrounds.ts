/**
 * Section backgrounds for the landing page, in page order. BackgroundStage stacks them
 * behind the content and crossfades as each `data-bg` section scrolls in.
 *
 * Add or replace one:
 *   1. Put a 1920×1080 JPEG in src/assets/backgrounds/ (art-direct it first if needed:
 *      originals live in design/backgrounds-source/, see scripts/prepare-backgrounds.mjs).
 *   2. Import it twice below (responsive picture + inline placeholder) and add an entry.
 *   3. Give the section `data-bg="<id>"`.
 * vite-imagetools builds AVIF/WebP/JPEG at 768/1280/1920 px at build time. The sources are
 * 1920 px, so no 2560 px version is made (it would only upscale).
 *
 * `overlay` is extra midnight darkening on top of the shared scrim (.bg-scrim, ≥35% everywhere).
 * Values come from `npm run bg:prepare`: each makes cream text at 70% opacity pass WCAG AA
 * (4.5:1) even over the brightest area of its image, so mid-crossfade blends also pass.
 */
import heroPic from '../assets/backgrounds/hero.jpg?w=768;1280;1920&format=avif;webp;jpg&as=picture';
import heroPh from '../assets/backgrounds/hero.jpg?w=24&format=webp&quality=40&inline';
import eventsPic from '../assets/backgrounds/events.jpg?w=768;1280;1920&format=avif;webp;jpg&as=picture';
import eventsPh from '../assets/backgrounds/events.jpg?w=24&format=webp&quality=40&inline';
import pastPic from '../assets/backgrounds/past.jpg?w=768;1280;1920&format=avif;webp;jpg&as=picture';
import pastPh from '../assets/backgrounds/past.jpg?w=24&format=webp&quality=40&inline';
import merchPic from '../assets/backgrounds/merch.jpg?w=768;1280;1920&format=avif;webp;jpg&as=picture';
import merchPh from '../assets/backgrounds/merch.jpg?w=24&format=webp&quality=40&inline';
import aboutPic from '../assets/backgrounds/about.jpg?w=768;1280;1920&format=avif;webp;jpg&as=picture';
import aboutPh from '../assets/backgrounds/about.jpg?w=24&format=webp&quality=40&inline';
import galleryPic from '../assets/backgrounds/gallery.jpg?w=768;1280;1920&format=avif;webp;jpg&as=picture';
import galleryPh from '../assets/backgrounds/gallery.jpg?w=24&format=webp&quality=40&inline';
import joinPic from '../assets/backgrounds/join.jpg?w=768;1280;1920&format=avif;webp;jpg&as=picture';
import joinPh from '../assets/backgrounds/join.jpg?w=24&format=webp&quality=40&inline';

export type BackgroundId = 'hero' | 'events' | 'past' | 'merch' | 'about' | 'gallery' | 'join';
export type SectionBackground = {
  id: BackgroundId;
  picture: ImagetoolsPicture;
  /** ~150-byte blurred data URL shown until the real image has loaded. */
  placeholder: string;
  /** object-position from md up. */
  focal: string;
  /** object-position under md. A portrait phone shows about a quarter of the 16:9 frame, so this aims that slice at
   *  the light source (the overlay values were measured on the brightest area, so any crop keeps text at AA). */
  focalMobile: string;
  /** Extra midnight darkening, 0–1, on top of the shared scrim. */
  overlay: number;
};

export const backgrounds: SectionBackground[] = [
  // bg-1 as shot: the identity image. The glow sits upper-left, clear of the centred headline.
  { id: 'hero', picture: heroPic, placeholder: heroPh, focal: '35% 40%', focalMobile: '28% 30%', overlay: 0.5 },
  // bg-2 bokeh: the liveliest frame, for what's coming up.
  { id: 'events', picture: eventsPic, placeholder: eventsPh, focal: '15% 60%', focalMobile: '6% 75%', overlay: 0.52 },
  // bg-3, slide number cropped, desaturated 40%: memory, slightly faded.
  { id: 'past', picture: pastPic, placeholder: pastPh, focal: '20% 60%', focalMobile: '10% 55%', overlay: 0.38 },
  // bg-5 curtains: a dark centre stage so the product video card pops.
  { id: 'merch', picture: merchPic, placeholder: merchPh, focal: '50% 50%', focalMobile: '84% 50%', overlay: 0.05 },
  // bg-4, slide number cropped: light from the right, opposite to "past" for rhythm.
  { id: 'about', picture: aboutPic, placeholder: aboutPh, focal: '85% 50%', focalMobile: '94% 50%', overlay: 0.29 },
  // bg-7 at 55% exposure and blurred: recedes so the photos are the content.
  { id: 'gallery', picture: galleryPic, placeholder: galleryPh, focal: '25% 75%', focalMobile: '18% 85%', overlay: 0.05 },
  // bg-1 mirrored and warmed: the page closes where it opened.
  { id: 'join', picture: joinPic, placeholder: joinPh, focal: '65% 40%', focalMobile: '62% 30%', overlay: 0.43 },
];
