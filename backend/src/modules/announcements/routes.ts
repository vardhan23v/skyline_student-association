import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../config/db';
import { hasRole, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { sendMail } from '../../lib/email';
import { logger } from '../../lib/logger';
import { todayYmd } from '../../lib/dates';

export const announcementsRouter = Router();
const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const body = z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(16000), /* TEXT is 64 KB on MySQL: 16k chars × 4 bytes (utf8mb4) still fits */ audience: z.enum(['all', 'members']).default('all') });

/** Archive is the table itself, newest first; members-only items require an active membership (or admin). */
announcementsRouter.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { isActiveMember } = await import('../memberships/service');
  const canSeeMembers = hasRole(req.user, 'admin') || (await isActiveMember(db, req.user?.id));
  const rows = await db('announcements as a').join('users as u', 'u.id', 'a.author_id')
    .select('a.*', 'u.name as author_name').modify((qb) => { if (!canSeeMembers) qb.where('a.audience', 'all'); })
    .orderBy('a.published_at', 'desc');
  res.json(rows);
}));

/** One post → website + mailing list. Nothing is editable after publish; append a correction instead. */
announcementsRouter.post('/', requireRole('admin'), validate({ body }), asyncHandler(async (req, res) => {
  const db = getDb();
  const [id] = await db('announcements').insert({ ...req.body, author_id: req.user!.id, published_at: new Date() });
  const recipients: string[] = req.body.audience === 'all'
    ? await db('users').where({ is_active: true }).pluck('email')
    : await db('users as u').join('members as m', 'm.user_id', 'u.id').join('memberships as ms', 'ms.member_id', 'm.id')
        .where('u.is_active', true) // deactivated accounts must not keep receiving member mail
        .where('ms.status', 'active').where('ms.expiry_date', '>=', todayYmd()).distinct('u.email').pluck('u.email');
  // The post is already published; a mail outage must not 500 (the admin would retry and publish a duplicate).
  const count = await sendMail({ to: recipients, subject: `[SSA] ${req.body.title}`, html: `<h2>${escapeHtml(req.body.title)}</h2><div>${escapeHtml(req.body.body).replace(/\n/g, '<br/>')}</div>` })
    .catch((err) => { logger.error({ err, announcement_id: id }, 'announcement email failed'); return null; });
  if (count !== null) await db('announcements').where({ id }).update({ email_sent_at: new Date(), email_recipient_count: count });
  res.status(201).json(await db('announcements').where({ id }).first());
}));
