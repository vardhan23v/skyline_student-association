import { env } from '../config/env';
import { logger } from './logger';

export type Mail = { to: string | string[]; subject: string; html: string };

/** Resend when a key is configured; otherwise log (dev/test). Returns recipient count. */
export async function sendMail(mail: Mail): Promise<number> {
  const to = Array.isArray(mail.to) ? mail.to : [mail.to];
  if (to.length === 0) return 0;
  if (!env.RESEND_API_KEY) {
    logger.info({ to, subject: mail.subject }, 'email (not sent: no RESEND_API_KEY)');
    return to.length;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject: mail.subject, html: mail.html }),
  });
  if (!res.ok) logger.error({ status: res.status, body: await res.text() }, 'resend failed');
  return to.length;
}
