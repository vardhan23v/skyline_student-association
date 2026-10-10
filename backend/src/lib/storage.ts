import { env } from '../config/env';
import { sha256 } from './hash';

export type Stored = { url: string; hash: string };

/**
 * Receipts/product images live off the API host (Cloudinary). Without CLOUDINARY_URL we
 * return a data URL so the flow still works locally; hash is always computed for duplicate detection.
 */
export async function storeFile(buf: Buffer, mime: string, folder: string): Promise<Stored> {
  const hash = sha256(buf);
  if (!env.CLOUDINARY_URL) return { url: `data:${mime};base64,${buf.toString('base64')}`, hash };
  const m = /^cloudinary:\/\/(\w+):([^@]+)@([\w-]+)$/.exec(env.CLOUDINARY_URL); // cloud names may contain '-'
  if (!m) throw new Error('Invalid CLOUDINARY_URL');
  const [, apiKey, apiSecret, cloud] = m;
  const timestamp = Math.floor(Date.now() / 1000);
  const crypto = await import('node:crypto');
  const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }));
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);
  const resource = mime === 'application/pdf' ? 'raw' : 'image';
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resource}/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);
  const json = (await res.json()) as { secure_url: string };
  return { url: json.secure_url, hash };
}

export const ALLOWED_UPLOAD_MIMES = ['image/jpeg', 'image/png', 'application/pdf'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
