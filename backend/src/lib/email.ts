import { env } from '../config/env';
import { logger } from './logger';

export type Mail = { to: string | string[]; subject: string; html: string };

const BATCH = 100; // Resend batch API limit

/**
 * Resend when a key is configured; otherwise log (dev/test). Returns how many recipients were accepted.
 * Never throws: callers fire-and-forget it, and an email outage must not fail (or crash) the request that triggered it.
 * Every recipient gets their own message — a single `to: [...]` would show the whole mailing list to every member,
 * and Resend rejects more than 50 addresses per message.
 */
export async function sendMail(mail: Mail): Promise<number> {
  const to = [...new Set(Array.isArray(mail.to) ? mail.to : [mail.to])].filter(Boolean);
  if (to.length === 0) return 0;
  if (!env.RESEND_API_KEY) {
    logger.info({ to, subject: mail.subject }, 'email (not sent: no RESEND_API_KEY)');
    return to.length;
  }
  let sent = 0;
  for (let i = 0; i < to.length; i += BATCH) {
    const chunk = to.slice(i, i + BATCH);
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map((addr) => ({ from: env.EMAIL_FROM, to: [addr], subject: mail.subject, html: mail.html }))),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) sent += chunk.length;
      else logger.error({ status: res.status, body: await res.text().catch(() => ''), recipients: chunk.length }, 'resend failed');
    } catch (err) {
      logger.error({ err, recipients: chunk.length }, 'resend request failed');
    }
  }
  return sent;
}
