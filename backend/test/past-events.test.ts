import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { seed as demo } from '../../database/seeds/001_demo';
import { PAST_EVENTS, seed as pastEvents } from '../../database/seeds/002_past_events';

let app: ReturnType<typeof createApp>;
const titles = PAST_EVENTS.map((e) => e.title);
const login = async (email: string, password: string) => ({ Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ email, password })).body.token}` });
const counts = async () => {
  const db = getDb();
  const ids = (await db('events').whereIn('title', titles).select('id')).map((r: any) => r.id);
  const [{ t }] = await db('tickets').whereIn('event_id', ids).count({ t: '*' });
  const [{ l }] = await db('ledger_entries').whereIn('event_id', ids).count({ l: '*' });
  return { events: ids.length, tickets: Number(t), ledger: Number(l) };
};

beforeAll(async () => {
  await freshDb(); app = createApp();
  await demo(getDb());
  await pastEvents(getDb());
});

describe('past events seed', () => {
  it('creates the five past events once, with their details; re-running adds nothing', async () => {
    const first = await counts();
    expect(first.events).toBe(5);
    expect(first.tickets).toBe(PAST_EVENTS.reduce((s, e) => s + e.sold, 0));
    await pastEvents(getDb());
    expect(await counts()).toEqual(first);
    const cs = await getDb()('events').where({ title: 'CodeStorm 2025' }).first();
    expect(cs).toMatchObject({ status: 'closed', venue: 'Main Auditorium', category: 'Technical', duration: '24 hours', participation: 'Teams of 2–4', capacity: 120, image_url: '/media/past/codestorm-2025.jpg' });
    expect(cs.image_alt).toMatch(/hackathon/);
  });

  it('refreshes details of an existing event on re-run instead of duplicating it', async () => {
    await getDb()('events').where({ title: 'Tech Trivia 2025' }).update({ venue: 'Somewhere else' });
    await pastEvents(getDb());
    expect((await getDb()('events').where({ title: 'Tech Trivia 2025' })).map((e: any) => e.venue)).toEqual(['Seminar Hall 2']);
  });
});

describe('GET /api/events?when=', () => {
  it('past returns them newest first, with attendance; upcoming leaves them out', async () => {
    const past = (await request(app).get('/api/events?when=past')).body as any[];
    const ours = past.filter((e) => titles.includes(e.title));
    expect(ours.map((e) => e.title)).toEqual([...titles].reverse());
    const starts = past.map((e) => +new Date(e.starts_at));
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
    for (const e of ours) {
      const [{ n }] = await getDb()('tickets').where({ event_id: e.id, status: 'checked_in' }).count({ n: '*' });
      expect(e.attended).toBe(Number(n));
      expect(e.attended).toBe(PAST_EVENTS.find((p) => p.title === e.title)!.sold);
      expect(e.ended).toBe(true);
    }
    const upcoming = (await request(app).get('/api/events?when=upcoming')).body as any[];
    expect(upcoming.some((e) => titles.includes(e.title))).toBe(false);
    expect(upcoming.map((e) => e.title)).toEqual(expect.arrayContaining(['CodeStorm 2026', 'Tech Trivia', 'Rhythm Unplugged', 'Spring Gala']));
    expect((await request(app).get('/api/events?when=soon')).status).toBe(400);
  });

  it('registering for a past event is 409 Event has ended', async () => {
    const id = (await getDb()('events').where({ title: 'Rhythm Unplugged 2025' }).first()).id;
    const r = await request(app).post(`/api/events/${id}/register`).set(await login('student@skyline.edu', 'Student@123'));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'EVENT_ENDED', message: 'Event has ended' });
  });
});

describe('money', () => {
  it('ticket income matches the prices paid, and finance totals equal the ledger sum', async () => {
    const db = getDb();
    for (const p of PAST_EVENTS) {
      const e = await db('events').where({ title: p.title }).first();
      const [{ paid }] = await db('tickets').where({ event_id: e.id }).sum({ paid: 'price' });
      const [{ income }] = await db('ledger_entries').where({ event_id: e.id, category: 'ticket', direction: 'in' }).sum({ income: 'amount' });
      expect(Number(income ?? 0)).toBe(Number(paid ?? 0));
    }
    expect(Number((await db('ledger_entries').whereIn('event_id', db('events').where({ title: 'Rhythm Unplugged 2025' }).select('id')).sum({ s: 'amount' }))[0].s)).toBeGreaterThan(0);
    const rows = await db('ledger_entries').select('direction', 'amount');
    const sum = Math.round(rows.reduce((s: number, r: any) => s + (r.direction === 'in' ? 1 : -1) * Number(r.amount), 0) * 100) / 100;
    const summary = (await request(app).get('/api/finance/summary').set(await login('admin@skyline.edu', 'Admin@123'))).body;
    expect(summary.balance).toBe(sum);
  });

  it('admins can change the photo; a bad URL is rejected and an empty one clears it', async () => {
    const admin = await login('admin@skyline.edu', 'Admin@123');
    const id = (await getDb()('events').where({ title: 'Lenscape: Photography Challenge 2025' }).first()).id;
    expect((await request(app).patch(`/api/admin/events/${id}`).set(admin).send({ image_url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await request(app).patch(`/api/admin/events/${id}`).set(admin).send({ image_url: 'https://images.example.com/x.jpg', image_alt: 'x' })).body.image_url).toBe('https://images.example.com/x.jpg');
    expect((await request(app).patch(`/api/admin/events/${id}`).set(admin).send({ image_url: '' })).body).toMatchObject({ image_url: null, image_alt: null });
  });
});
