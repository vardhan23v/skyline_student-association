import type { Knex } from 'knex';
import type { AuthUser, Role } from '../../middleware/auth';
import { badRequest } from '../../lib/errors';
import { summary } from '../finance/service';
import { eventReport } from '../events/service';
import { listMembers } from '../memberships/service';
import { z } from 'zod';
import { sendMail, siteLink } from '../../lib/email';
import { todayYmd } from '../../lib/dates';

const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const ymd = (v: unknown) => (z.string().date().safeParse(v).success ? (v as string) : undefined);
/** Tool args come from the LLM (and, indirectly, from user-written text it read): validate before they reach a proposal. */
const reviewPayload = z.object({ id: z.coerce.number().int().positive(), decision: z.enum(['approved', 'rejected']), note: z.string().max(1000).optional() });

export type Tool = {
  name: string; description: string; roles: Role[]; input_schema: any;
  run: (args: any) => Promise<any>;
  /** For proposal tools: executes after explicit confirmation. */
  execute?: (payload: any) => Promise<any>;
};

export function buildTools(db: Knex, user: AuthUser): Tool[] {
  return [
    { name: 'getFinanceSummary', description: 'Balance and totals by category/event/fundraiser', roles: ['admin'], input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
      run: (a) => summary({ from: ymd(a?.from), to: ymd(a?.to) }) },
    { name: 'getFlaggedExpenses', description: 'Submitted expenses with anomaly flags', roles: ['admin'], input_schema: { type: 'object', properties: {} },
      // Explicit columns: receipt_url can be a multi-MB data: URL, which blew the LLM request size.
      run: async () => (await db('expenses').where({ status: 'submitted' }).select('id', 'submitted_by', 'amount', 'category', 'description', 'event_id', 'fundraiser_id', 'flags', 'created_at'))
        .map((r) => ({ ...r, flags: typeof r.flags === 'string' ? JSON.parse(r.flags) : r.flags ?? [] })).filter((r) => r.flags.length) },
    { name: 'getExpiringMembers', description: 'Members whose membership expires within N days', roles: ['admin'], input_schema: { type: 'object', properties: { days: { type: 'number' } } },
      // A string "30" used to be concatenated into setDate(); clamp to a sane integer window.
      run: (a) => listMembers({ expiring_within_days: Math.min(365, Math.max(1, Math.trunc(Number(a?.days)) || 14)) }) },
    { name: 'getEventReport', description: 'Sold / checked-in / no-show / revenue for an event', roles: ['admin'], input_schema: { type: 'object', properties: { eventId: { type: 'number' } }, required: ['eventId'] },
      run: (a) => eventReport(Number(a?.eventId)) },
    { name: 'getOverdueTasks', description: 'Tasks past due and not done', roles: ['admin'], input_schema: { type: 'object', properties: { fundraiserId: { type: 'number' } } },
      run: (a) => db('tasks').where('due_on', '<', todayYmd()).whereNot('status', 'done').modify((qb) => { if (a?.fundraiserId) qb.where('fundraiser_id', a.fundraiserId); }) },
    { name: 'draftAnnouncement', description: 'Draft an announcement for admin confirmation (does not publish)', roles: ['admin'], input_schema: { type: 'object', properties: { topic: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['topic'] },
      run: async (a) => {
        const topic = typeof a?.topic === 'string' ? a.topic.trim() : '';
        if (!topic) return { error: 'topic is required' };
        const title = (typeof a.title === 'string' && a.title.trim() ? a.title.trim() : `Update: ${topic.slice(0, 80)}`).slice(0, 200);
        const body = (typeof a.body === 'string' && a.body.trim() ? a.body : `Dear members,\n\n${topic}\n\n— SSA`).slice(0, 16000);
        return { __proposal: { action: 'draftAnnouncement', required_role: 'admin', payload: { title, body, audience: 'all' } } };
      },
      execute: async (payload) => {
        // Only known fields reach the table (never spread the stored payload into the insert).
        const title = String(payload?.title ?? '').slice(0, 200), body = String(payload?.body ?? '');
        if (!title || !body) throw badRequest('Invalid announcement proposal');
        const [id] = await db('announcements').insert({ title, body, audience: 'all', author_id: user.id, published_at: new Date() });
        const to = await db('users').where({ is_active: true }).pluck('email');
        const count = await sendMail({ to, subject: `[SSA] ${title}`, html: escapeHtml(body).replace(/\n/g, '<br/>') + siteLink('/announcements', 'Read on the SSA site') });
        await db('announcements').where({ id }).update({ email_sent_at: new Date(), email_recipient_count: count });
        return { announcement_id: id };
      } },
    { name: 'proposeExpenseReview', description: 'Propose approving/rejecting an expense (an admin confirms)', roles: ['admin'], input_schema: { type: 'object', properties: { id: { type: 'number' }, decision: { type: 'string', enum: ['approved', 'rejected'] }, note: { type: 'string' } }, required: ['id', 'decision'] },
      run: async (a) => {
        // The raw LLM args used to be stored as-is, so a prompt-injected decision such as 'paid' could be confirmed.
        const p = reviewPayload.safeParse(a);
        if (!p.success) return { error: 'Invalid expense review: id must be an expense id and decision approved|rejected' };
        return { __proposal: { action: 'proposeExpenseReview', required_role: 'admin', payload: p.data } };
      },
      execute: async (payload) => {
        const p = reviewPayload.safeParse(payload);
        if (!p.success) throw badRequest('Invalid expense review proposal');
        const { reviewExpense } = await import('../finance/service');
        return reviewExpense(user.id, p.data.id, p.data.decision, p.data.note);
      } },
  ];
}
