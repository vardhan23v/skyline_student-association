/**
 * One-off art direction for the landing backgrounds (run: `npm run bg:prepare`).
 * Reads the originals in design/backgrounds-source/ (bg-1 … bg-7, in the order supplied),
 * writes one 1920×1080 master per section to src/assets/backgrounds/, and prints the
 * minimum darkening each needs so cream text (#F6E9CE) passes WCAG AA (4.5:1) on its
 * brightest area. vite-imagetools makes the responsive AVIF/WebP/JPEG at build time.
 */
import sharp from 'sharp';
import { readdirSync } from 'node:fs';

const SRC = 'design/backgrounds-source';
const OUT = 'src/assets/backgrounds';
const file = (n) => `${SRC}/${readdirSync(SRC).find((f) => f.startsWith(`bg-${n}.`))}`;
// bg-3 and bg-4 carry a slide number in the bottom-right corner: keep the 16:9 area above-left of it.
const cropNumber = (img) => img.extract({ left: 0, top: 0, width: 1680, height: 945 }).resize(1920, 1080);

const plans = {
  hero: { src: 1, edit: (i) => i }, // bg-1 as shot: the identity image
  events: { src: 2, edit: (i) => i }, // bokeh: lively, same warm palette
  past: { src: 3, edit: (i) => cropNumber(i).modulate({ saturation: 0.6 }) }, // desaturated = "past"
  merch: { src: 5, edit: (i) => i.modulate({ brightness: 0.85 }) }, // curtains frame a dark stage for product media
  about: { src: 4, edit: (i) => cropNumber(i) },
  gallery: { src: 7, edit: (i) => i.modulate({ brightness: 0.55, saturation: 0.7 }).blur(6) }, // recedes behind the photos
  join: { src: 1, edit: (i) => i.flop().modulate({ brightness: 0.9, hue: -6 }) }, // bg-1 mirrored, warmer: closes where it opened
};

const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
const CREAM = lum([0xf6, 0xe9, 0xce]);
const MAX_BG = (CREAM + 0.05) / 4.5 - 0.05; // brightest background luminance that still gives 4.5:1

for (const [id, p] of Object.entries(plans)) {
  const img = p.edit(sharp(file(p.src)));
  await img.clone().jpeg({ quality: 88, mozjpeg: true }).toFile(`${OUT}/${id}.jpg`);
  // Worst case over the image, at text scale (downsample removes grain specks text never sits on alone).
  const { data, info } = await img.clone().resize(64, 36, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let worst = [0, 0, 0];
  for (let k = 0; k < data.length; k += info.channels) {
    const px = [data[k], data[k + 1], data[k + 2]];
    if (lum(px) > lum(worst)) worst = px;
  }
  // Midnight overlay alpha a (sRGB blend, as the browser does) so the worst pixel passes.
  let a = 0;
  while (a < 1 && lum(worst.map((c) => (1 - a) * c + a * 11)) > MAX_BG) a += 0.01;
  console.log(id.padEnd(8), 'brightest', `rgb(${worst.join(',')})`, 'needs total darkening', a.toFixed(2));
}
