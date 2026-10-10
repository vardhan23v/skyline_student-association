// Static host for the built frontend (frontend/dist) with single-page-app fallback.
// There is no backend in this repo right now; this only serves files. No dependencies.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('frontend/dist');
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  // Resolve inside dist only (blocks ../ traversal).
  const file = normalize(join(root, decodeURIComponent(url.pathname)));
  const inside = file.startsWith(root);
  const isFile = inside && existsSync(file) && statSync(file).isFile();
  // Unknown paths with a file extension are real 404s; everything else is an app route → index.html.
  if (!isFile && extname(url.pathname)) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
  const target = isFile ? file : join(root, 'index.html');
  const hashed = url.pathname.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': types[extname(target)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  });
  createReadStream(target).pipe(res);
}).listen(port, () => console.log(`Serving frontend/dist on :${port}`));
