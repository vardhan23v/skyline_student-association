import { beforeAll, describe, expect, it } from 'vitest';
import { announcementText, eventText, MAX_SHARE_LENGTH, whatsappUrl } from './share';

beforeAll(() => { (globalThis as any).window = { location: { origin: 'https://ssa.example' } }; });

const event = { id: 7, title: 'Spring Gala', starts_at: '2026-11-20T13:30:00.000Z', venue: 'Main Auditorium', member_price: 299, non_member_price: 499, members_only: false };

describe('announcementText', () => {
  it('has the title, the body and a link to the post', () => {
    const t = announcementText({ id: 12, title: 'Gala tickets', body: 'Seats are limited.' });
    expect(t).toContain('📢 SKYLINE STUDENT ASSOCIATION\n*Gala tickets*\n\nSeats are limited.');
    expect(t).toContain('Read more: https://ssa.example/announcements#a-12');
  });

  it('cuts a long body at a word boundary and adds …', () => {
    const body = 'word '.repeat(100);
    const cut = announcementText({ id: 1, title: 'T', body }).split('\n\n')[1];
    expect(cut.endsWith('word…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(300);
    expect(announcementText({ id: 1, title: 'T', body: 'short' })).not.toContain('…');
  });

  it('stays within the limit for a 5,000-character body and a long title', () => {
    const t = announcementText({ id: 99, title: 'x'.repeat(200), body: 'lorem ipsum '.repeat(420) });
    expect(t.length).toBeLessThanOrEqual(MAX_SHARE_LENGTH);
    expect(t).toContain('#a-99');
  });
});

describe('eventText', () => {
  it('shows both prices, date, venue and the register link', () => {
    const t = eventText(event);
    expect(t).toContain('🎟 *Spring Gala*');
    expect(t).toContain('20 Nov');
    expect(t).toMatch(/07:00 pm/i); // 13:30 UTC in the club's zone (IST)
    expect(t).toContain('📍 Main Auditorium');
    expect(t).toContain('₹499 · Members ₹299');
    expect(t).toContain('Register: https://ssa.example/events/7');
  });

  it('says Members only for members-only events, and Free for 0', () => {
    expect(eventText({ ...event, members_only: true })).toContain('Members only · ₹299');
    expect(eventText({ ...event, members_only: true, member_price: 0 })).toContain('Members only · Free');
    expect(eventText({ ...event, member_price: 0, non_member_price: 49 })).toContain('₹49 · Members Free');
  });
});

describe('whatsappUrl', () => {
  it('encodes newlines, emoji and ₹ so they round-trip', () => {
    const text = eventText(event);
    const url = whatsappUrl(text);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(url).not.toMatch(/[\n ₹🎟]/u);
    expect(url).toContain('%0A');
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe(text);
  });
});
