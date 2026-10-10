import type { Knex } from 'knex';
import type { AuthUser, Role } from '../../middleware/auth';
import { summary } from '../finance/service';
import { eventReport } from '../events/service';
import { listMembers } from '../memberships/service';
import { sendMail } from '../../lib/email';

export type Tool = {
  name: string; description: string; roles: Role[]; input_schema: any;
  run: (args: any) => Promise<any>;
  /** For proposal tools: executes after explicit confirmation. */
  execute?: (payload: any) => Promise<any>;
};

export function buildTools(db: Knex, user: AuthUser): Tool[] {
  return [
    { name: 'getFinanceSummary', description: 'Balance and totals by category/event/fundraiser', roles: ['member'], input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
      run: (a) => summary({ from: a?.from, to: a?.to }) },
    { name: 'getFlaggedExpenses', description: 'Submitted expenses with anomaly flags', roles: ['treasurer'], input_schema: { type: 'object', properties: {} },
      run: async () => (await db('expenses').where({ status: 'submitted' })).map((r) => ({ ...r, flags: typeof r.flags === 'string' ? JSON.parse(r.flags) : r.flags ?? [] })).filter((r) => r.flags.length) },
    { name: 'getExpiringMembers', description: 'Members whose membership expires within N days', roles: ['admin'], input_schema: { type: 'object', properties: { days: { type: 'number' } } },
      run: (a) => listMembers({ expiring_within_days: a?.days ?? 14 }) },
    { name: 'getEventReport', description: 'Sold / checked-in / no-show / revenue for an event', roles: ['admin', 'treasurer'], input_schema: { type: 'object', properties: { eventId: { type: 'number' } }, required: ['eventId'] },
      run: (a) => eventReport(Number(a.eventId)) },
    { name: 'getOverdueTasks', description: 'Tasks past due and not done', roles: ['volunteer'], input_schema: { type: 'object', properties: { fundraiserId: { type: 'number' } } },
      run: (a) => db('tasks').where('due_on', '<', new Date().toISOString().slice(0, 10)).whereNot('status', 'done').modify((qb) => { if (a?.fundraiserId) qb.where('fundraiser_id', a.fundraiserId); }) },
    { name: 'draftAnnouncement', description: 'Draft an announcement for admin confirmation (does not publish)', roles: ['admin'], input_schema: { type: 'object', properties: { topic: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['topic'] },
      run: async (a) => ({ __proposal: { action: 'draftAnnouncement', required_role: 'admin', payload: { title: a.title ?? `Update: ${a.topic.slice(0, 80)}`, body: a.body ?? `Dear members,\n\n${a.topic}\n\n— SSA`, audience: 'all' } } }),
      execute: async (payload) => {
        const [id] = await db('announcements').insert({ ...payload, author_id: user.id, published_at: new Date() });
        const to = await db('users').where({ is_active: true }).pluck('email');
        const count = await sendMail({ to, subject: `[SSA] ${payload.title}`, html: payload.body.replace(/\n/g, '<br/>') });
        await db('announcements').where({ id }).update({ email_sent_at: new Date(), email_recipient_count: count });
        return { announcement_id: id };
      } },
    { name: 'proposeExpenseReview', description: 'Propose approving/rejecting an expense (treasurer confirms)', roles: ['treasurer'], input_schema: { type: 'object', properties: { id: { type: 'number' }, decision: { type: 'string', enum: ['approved', 'rejected'] }, note: { type: 'string' } }, required: ['id', 'decision'] },
      run: async (a) => ({ __proposal: { action: 'proposeExpenseReview', required_role: 'treasurer', payload: a } }),
      execute: async (payload) => { const { reviewExpense } = await import('../finance/service'); return reviewExpense(user.id, Number(payload.id), payload.decision, payload.note); } },
  ];
}
