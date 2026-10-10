/**
 * Phone-size copies of the landing photos: public/media/{past,gallery}/<name>.jpg → <name>-480.jpg (480px wide).
 * PastEventsGrid and GalleryMarquee list both in srcset, so phones fetch the small one.
 * Run after replacing a photo: npm run media:prepare
 */
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

for (const dir of ['public/media/past', 'public/media/gallery']) {
  for (const f of readdirSync(dir).filter((x) => /\.jpe?g$/i.test(x) && !/-480\.jpe?g$/i.test(x))) {
    const out = join(dir, f.replace(/\.jpe?g$/i, '-480.jpg'));
    await sharp(join(dir, f)).resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 74, mozjpeg: true }).toFile(out);
    console.log(out);
  }
}
