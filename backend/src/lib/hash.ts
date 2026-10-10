import crypto from 'node:crypto';
export const sha256 = (buf: Buffer | string) => crypto.createHash('sha256').update(buf).digest('hex');
export const hmacSha256 = (secret: string, body: Buffer | string) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');
export const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
