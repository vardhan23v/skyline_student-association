import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { logger } from '../src/lib/logger';
import { signToken, type Role } from '../src/middleware/auth';
import { sendEventReminders } from '../src/modules/events/service';

let app: ReturnType<typeof createApp>;
const users: Record<string, { id: number; token: string }> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${users[who].token}` });
const H = 3600_000;
const event = async (title: string, inHours: number, extra: Record<string, unknown> = {}) =>
  (await getDb()('events').insert({ title, starts_at: new Date(Date.now() + inHours * H), capacity: 50, member_price: 0, non_member_price: 0, status: 'published', venue: 'Hall 2, Block A', ...extra }))[0] as number;
const ticket = async (event_id: number, who: string, status = 'confirmed') =>
  (await getDb()('tickets').insert({ event_id, holder_user_id: users[who].id, holder_name: who, holder_email: `${who}@ev.test`, ticket_type: 'member', price: 0, status }))[0] as number;
const reminderMails = (spy: ReturnType<typeof vi.spyOn>) => (spy.mock.calls as any[]).filter((c) => String(c[0]?.subject ?? '').startsWith('Tomorrow:'));

beforeAll(async () => {
  await freshDb();
  app = createApp();
  for (const [name, role] of [['ana', 'user'], ['ben', 'user'], ['cara', 'user'], ['admin', 'admin']] as [string, Role][]) {
    const [id] = await getDb()('users').insert({ name, email: `${name}@ev.test`, password_hash: 'x', role });
    users[name] = { id: id as number, token: signToken({ id: id as number, role, email: `${name}@ev.test` }) };
  }
});
afterEach(() => vi.restoreAllMocks());

describe('event reminder job', () => {
  it('reminds once for an event 24 hours away, never twice, and not cancelled tickets or other days', async () => {
    const gala = await event('Spring Gala', 24);
    const later = await event('Next week', 24 * 7);
    const soon = await event('In an hour', 1);
    const ok = await ticket(gala, 'ana');
    const cancelled = await ticket(gala, 'ben', 'cancelled');
    await ticket(later, 'ana'); await ticket(soon, 'cara');
    const spy = vi.spyOn(logger, 'info');
    expect(await sendEventReminders()).toBe(1);
    const mails = reminderMails(spy);
    expect(mails).toHaveLength(1);
    expect(mails[0][0]).toMatchObject({ to: ['ana@ev.test'] });
    expect(mails[0][0].subject).toMatch(/^Tomorrow: Spring Gala at .+, Hall 2, Block A$/);
    expect(await sendEventReminders()).toBe(0);
    expect(reminderMails(spy)).toHaveLength(1);
    const db = getDb();
    expect((await db('tickets').where({ id: ok }).first()).reminder_sent_at).toBeTruthy();
    expect((await db('tickets').where({ id: cancelled }).first()).reminder_sent_at).toBeNull();
  });

  it('catches an event at either edge of the 23–25 hour window, and runs that overlap still send once', async () => {
    const edge = await event('Edge', 23.5);
    await ticket(edge, 'cara');
    const [a, b] = await Promise.all([sendEventReminders(), sendEventReminders()]);
    expect(a + b).toBe(1);
  });
});

describe('add to calendar', () => {
  it('returns a valid .ics for the holder: content type, UID, UTC times, 2 hours, escaped text', async () => {
    const eid = await event('Rhythm; Unplugged, Live', 72, { description: 'Music, dance\nand more' });
    const tid = await ticket(eid, 'ana');
    const r = await request(app).get(`/api/tickets/${tid}/calendar.ics`).set(auth('ana'));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/calendar/);
    expect(r.headers['content-disposition']).toContain(`ssa-ticket-${tid}.ics`);
    const body = r.text;
    expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(body.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    const unfolded = body.replace(/\r\n /g, '');
    expect(unfolded).toContain(`UID:ticket-${tid}@skyline`);
    expect(unfolded).toContain('SUMMARY:Rhythm\; Unplugged\\, Live');
    expect(unfolded).toContain('LOCATION:Hall 2\\, Block A');
    expect(unfolded).toMatch(/DESCRIPTION:Music\\, dance\\nand more\\n\\nYour ticket: http.+\/tickets\/\d+/);
    const start = /DTSTART:(\d{8}T\d{6}Z)/.exec(unfolded)![1], end = /DTEND:(\d{8}T\d{6}Z)/.exec(unfolded)![1];
    const parse = (s: string) => Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`);
    expect(parse(end) - parse(start)).toBe(2 * H);
    expect(body.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it("is the holder's only: another user, even an admin, gets 403", async () => {
    const tid = await ticket(await event('Private', 48), 'ana');
    expect((await request(app).get(`/api/tickets/${tid}/calendar.ics`).set(auth('ben'))).status).toBe(403);
    expect((await request(app).get(`/api/tickets/${tid}/calendar.ics`).set(auth('admin'))).status).toBe(403);
    expect((await request(app).get(`/api/tickets/${tid}/calendar.ics`)).status).toBe(401);
    expect((await request(app).get('/api/tickets/999999/calendar.ics').set(auth('ana'))).status).toBe(404);
  });
});

describe('GET /me/upcoming', () => {
  it("lists the caller's confirmed tickets for future events, soonest first", async () => {
    const r = (await request(app).get('/api/me/upcoming').set(auth('ana'))).body;
    const starts = r.map((t: any) => +new Date(t.starts_at));
    expect(r.length).toBeGreaterThan(1);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(starts.every((s: number) => s > Date.now())).toBe(true);
    expect(r[0]).toMatchObject({ event_title: 'Spring Gala', venue: 'Hall 2, Block A' });
    expect((await request(app).get('/api/me/upcoming').set(auth('ben'))).body).toEqual([]); // only a cancelled ticket
  });
});
