import type { Knex } from 'knex';
import { signTicketQr } from '../../backend/src/lib/qr';
import { recordEntry } from '../../backend/src/modules/finance/service';

/**
 * Last year's editions of the club's events, with a realistic past record: checked-in tickets and the matching ticket
 * income in the ledger (written through the finance service, so totals stay consistent).
 *
 * Idempotent, upsert by title: a new event is created with its tickets in one transaction; an existing one only has its
 * details refreshed (photo, description…), never a second set of tickets. Unlike 001_demo it doesn't wipe anything and
 * it runs on a database that already has users, so a deploy adds these to the live demo without a reseed.
 *
 * Attendees: the database's own students first, then walk-in guests (a holder name and email, no account), like the
 * cash tickets sold at the door. Prices are last year's: members paid the member price, guests the non-member price.
 */
type PastEvent = {
  slug: string; title: string; category: string; starts_at: string; venue: string; duration: string; participation: string;
  capacity: number; sold: number; member_price: number; non_member_price: number; members_only?: boolean; description: string; image_alt: string;
};

export const PAST_EVENTS: PastEvent[] = [
  {
    slug: 'codestorm-2025', title: 'CodeStorm 2025', category: 'Technical', starts_at: '2025-10-24T10:00:00+05:30', venue: 'Main Auditorium',
    duration: '24 hours', participation: 'Teams of 2–4', capacity: 120, sold: 96, member_price: 0, non_member_price: 0, members_only: true,
    description: 'A 24-hour hackathon where students collaborated to build innovative solutions to real-world problems using software development, AI and emerging technologies. Participants presented their prototypes to a panel of judges.',
    image_alt: 'Students coding at laptops around a shared table during a hackathon',
  },
  {
    slug: 'tech-trivia-2025', title: 'Tech Trivia 2025', category: 'Technical', starts_at: '2025-10-28T10:00:00+05:30', venue: 'Seminar Hall 2',
    duration: '2 hours', participation: 'Individual', capacity: 80, sold: 52, member_price: 0, non_member_price: 49,
    description: 'A quiz on programming, computer science, cybersecurity and technology trends, with multiple rounds including rapid-fire questions and problem-solving tasks.',
    image_alt: 'College students seated at desks in a hall, listening during a quiz round',
  },
  {
    slug: 'rhythm-unplugged-2025', title: 'Rhythm Unplugged 2025', category: 'Non-Technical', starts_at: '2025-10-31T17:00:00+05:30', venue: 'Open-Air Theatre',
    duration: '3 hours', participation: 'Solo and group categories', capacity: 300, sold: 186, member_price: 99, non_member_price: 199,
    description: 'A cultural evening of music, dance and artistic expression: solo performances, group dance battles and live musical acts.',
    image_alt: 'A group of performers on stage under coloured stage lights',
  },
  {
    slug: 'lenscape-2025', title: 'Lenscape: Photography Challenge 2025', category: 'Non-Technical', starts_at: '2025-11-04T09:00:00+05:30', venue: 'College Campus',
    duration: '4 hours', participation: 'Individual', capacity: 60, sold: 33, member_price: 0, non_member_price: 49,
    description: 'A photography challenge on campus life, nature, architecture and candid moments, judged on creativity, composition and storytelling.',
    image_alt: 'A student photographer framing a shot with a DSLR camera',
  },
  {
    slug: 'innovatex-2025', title: 'InnovateX: Startup Pitch 2025', category: 'Technical · Business', starts_at: '2025-11-07T14:00:00+05:30', venue: 'Innovation Centre',
    duration: '3 hours', participation: 'Teams of 2–3', capacity: 50, sold: 38, member_price: 49, non_member_price: 99,
    description: 'Teams pitched products, services and technology-driven ideas to a judging panel, showing problem-solving, market understanding and entrepreneurial thinking.',
    image_alt: 'A student team on stage at a startup pitch event',
  },
];

const FIRST = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Ishita', 'Kabir', 'Saanvi', 'Reyansh', 'Myra', 'Aditya', 'Kavya', 'Rohan', 'Nisha', 'Siddharth', 'Tanvi', 'Yash', 'Pooja', 'Karthik', 'Sneha', 'Varun', 'Riya', 'Nikhil', 'Aditi'];
const LAST = ['Sharma', 'Reddy', 'Iyer', 'Nair', 'Patel', 'Gupta', 'Rao', 'Menon', 'Das', 'Kulkarni', 'Singh', 'Joshi', 'Pillai', 'Verma', 'Bose', 'Hegde'];
const details = (e: PastEvent) => ({
  description: e.description, starts_at: new Date(e.starts_at), venue: e.venue, capacity: e.capacity, member_price: e.member_price,
  non_member_price: e.non_member_price, members_only: !!e.members_only, status: 'closed', category: e.category, duration: e.duration,
  participation: e.participation, image_url: `/media/past/${e.slug}.jpg`, image_alt: e.image_alt,
});

export async function seed(k: Knex): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('[seed] refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true to allow it.');
  }
  const admin = await k('users').where({ role: 'admin' }).orderBy('id').first();
  if (!admin) { console.warn('[seed] past events skipped: no admin yet (run 001_demo first).'); return; }
  // created_at in the column's own format (SQLite stores UTC text; a JS Date would bind as epoch ms).
  const ts = (d: Date) => (k.client.config.client === 'mysql2' ? d : d.toISOString().replace('T', ' ').slice(0, 19));
  const students = await k('users').where({ role: 'user' }).orderBy('id').select('id', 'name', 'email');
  const memberIds = new Set((await k('members').join('memberships', 'memberships.member_id', 'members.id').distinct('members.user_id')).map((r: any) => Number(r.user_id)));

  for (const e of PAST_EVENTS) {
    const existing = await k('events').where({ title: e.title }).first();
    if (existing) { await k('events').where({ id: existing.id }).update(details(e)); continue; }
    await k.transaction(async (trx) => {
      const [event_id] = await trx('events').insert({ title: e.title, ...details(e) });
      const start = new Date(e.starts_at);
      for (let n = 0; n < e.sold; n++) {
        const s = students[n];
        // Guests alternate member and non-member (they were members last year or not); members-only events had members only.
        const member = s ? memberIds.has(Number(s.id)) || !!e.members_only : !!e.members_only || n % 2 === 0;
        const holder = s
          ? { holder_user_id: s.id, holder_name: s.name, holder_email: s.email }
          : (() => { const f = FIRST[n % FIRST.length], l = LAST[(n * 7 + e.slug.length) % LAST.length]; return { holder_user_id: null, holder_name: `${f} ${l}`, holder_email: `${f}.${l}.${e.slug.slice(0, 4)}${n}@guest.skyline.edu`.toLowerCase() }; })();
        const price = member ? e.member_price : e.non_member_price;
        const bought = new Date(start.getTime() - (2 + (n % 12)) * 86_400_000);
        const [ticket_id] = await trx('tickets').insert({
          event_id, ...holder, ticket_type: member ? 'member' : 'non_member', price, status: 'checked_in',
          checked_in_at: new Date(start.getTime() + (n % 45) * 60_000), checked_in_by: admin.id, created_at: ts(bought),
        });
        const [payment_id] = await trx('payments').insert({
          user_id: holder.holder_user_id, amount: price, currency: 'INR', purpose: 'ticket', reference_type: 'ticket', reference_id: ticket_id,
          provider: 'cash', provider_payment_id: `seed_past_${e.slug}_${n}`, status: 'paid', paid_at: bought,
        });
        await trx('tickets').where({ id: ticket_id }).update({ payment_id, qr_token: signTicketQr({ tid: ticket_id as number, eid: event_id as number }, new Date(start.getTime() + 86_400_000)) });
        if (price > 0) await recordEntry(trx, { direction: 'in', amount: price, category: 'ticket', source_type: 'payment', source_id: payment_id as number, event_id: event_id as number, memo: `Ticket #${ticket_id}`, entered_by: admin.id, occurred_at: bought });
      }
    });
  }
}
