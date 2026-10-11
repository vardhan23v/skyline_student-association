/**
 * Event cover photos: <originals dir>/<slug>.jpg|png → public/media/past/
 *   <slug>.jpg and <slug>.webp   1600px wide, about 200 KB (quality steps down until it fits)
 *   <slug>-480.jpg / -480.webp   phone copies
 *   <slug>-blur.webp             24px wide, shown blurred while the photo loads
 * EventPhoto and the landing Past Events grid expect exactly these names. Credit every photo in public/media/past/CREDITS.md.
 * Usage: npm run photos:prepare -- <originals dir>
 */
import sharp from 'sharp';
import { readdirSync, statSync } from 'node:fs';
import { join, parse } from 'node:path';

const src = process.argv[2];
if (!src) { console.error('usage: npm run photos:prepare -- <originals dir>'); process.exit(1); }
const out = 'public/media/past';
const TARGET = 230 * 1024;

for (const f of readdirSync(src).filter((x) => /\.(jpe?g|png)$/i.test(x))) {
  const slug = parse(f).name;
  const base = () => sharp(join(src, f)).rotate().resize({ width: 1600, withoutEnlargement: true });
  for (let q = 80; q >= 55; q -= 5) {
    await base().jpeg({ quality: q, mozjpeg: true }).toFile(join(out, `${slug}.jpg`));
    if (statSync(join(out, `${slug}.jpg`)).size <= TARGET || q === 55) break;
  }
  await base().webp({ quality: 72 }).toFile(join(out, `${slug}.webp`));
  const small = () => sharp(join(src, f)).rotate().resize({ width: 480 });
  await small().jpeg({ quality: 74, mozjpeg: true }).toFile(join(out, `${slug}-480.jpg`));
  await small().webp({ quality: 70 }).toFile(join(out, `${slug}-480.webp`));
  await sharp(join(src, f)).rotate().resize({ width: 24 }).webp({ quality: 40 }).toFile(join(out, `${slug}-blur.webp`));
  const kb = (n) => `${Math.round(statSync(join(out, n)).size / 1024)} KB`;
  console.log(`${slug}: jpg ${kb(`${slug}.jpg`)} · webp ${kb(`${slug}.webp`)} · blur ${kb(`${slug}-blur.webp`)}`);
}
