import type { Knex } from 'knex';
import bcrypt from '../../backend/node_modules/bcryptjs/index.js';
import { hashPassword } from '../../backend/src/lib/password';
import { signTicketQr } from '../../backend/src/lib/qr';
import { academicYearEnd } from '../../backend/src/modules/memberships/service';
import { recordFundraiserCash } from '../../backend/src/modules/finance/service';
import { addDaysYmd, todayYmd } from '../../backend/src/lib/dates';

/**
 * Demo data for the two-role model. Logins (change them before real use):
 *   admin@skyline.edu / Control#Room26   admin
 *   core@skyline.edu / Second#Desk26     a second admin, so fundraiser tasks can be split between admins
 *   member@skyline.edu / Gala#Night26    user with an active membership until the academic year ends
 *   student@skyline.edu / Campus#Walk26  user without a membership
 *   lapsed@skyline.edu / Renew#Later26   user whose membership ended 30 days ago (shows in "Who owes what")
 * Each meets the password rules (lib/password-rules.ts), including not containing the email name.
 * WIPES every table first.
 */
/** The documented demo logins, and the passwords they had before the password rules (Phase 7). */
export const DEMO_LOGINS = [
  { email: 'admin@skyline.edu', password: 'Control#Room26', old: 'Admin@123' },
  { email: 'core@skyline.edu', password: 'Second#Desk26', old: 'Core@123' },
  { email: 'member@skyline.edu', password: 'Gala#Night26', old: 'Member@123' },
  { email: 'student@skyline.edu', password: 'Campus#Walk26', old: 'Student@123' },
  { email: 'lapsed@skyline.edu', password: 'Renew#Later26', old: 'Lapsed@123' },
];

/**
 * A database seeded before the password rules still has the old, public demo passwords. Move each demo account to its
 * new documented password, but only while it still has the old one: an account whose password someone changed is left
 * alone. Idempotent; runs on boots that skip the full seed.
 */
async function upgradeDemoPasswords(k: Knex) {
  for (const d of DEMO_LOGINS) {
    const u = await k('users').where({ email: d.email }).first();
    if (u && (await bcrypt.compare(d.old, u.password_hash))) {
      await k('users').where({ id: u.id }).update({ password_hash: await hashPassword(d.password), password_weak: false });
      console.warn(`[seed] demo password updated for ${d.email}`);
    }
  }
}

export async function seed(k: Knex): Promise<void> {
  const prod = process.env.NODE_ENV === 'production';
  if (prod && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('[seed] refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true to allow it.');
  }
  // `npm start` runs this on every boot while ALLOW_DEMO_SEED=true: never wipe a database that already has users
  // unless SEED_FORCE=true is set as well (and remove it again after one boot).
  if (prod && process.env.SEED_FORCE !== 'true' && (await k('users').first())) {
    await upgradeDemoPasswords(k);
    console.warn('[seed] skipped: database already has users. Set SEED_FORCE=true for one boot to wipe and reseed.');
    return;
  }
  for (const t of ['webhook_events', 'ai_proposals', 'ai_audit', 'cash_receipts', 'ledger_entries', 'expenses', 'tasks', 'fundraisers', 'order_items', 'orders', 'product_variants', 'products', 'announcements', 'tickets', 'events', 'memberships', 'payments', 'members', 'users']) await k(t).del();

  const day = 86_400_000; const now = Date.now();
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  // created_at in the column's own format: a JS Date on SQLite binds as epoch ms and breaks the hold-expiry comparisons.
  const ts = (ms: number) => (k.client.config.client === 'mysql2' ? new Date(ms) : new Date(ms).toISOString().replace('T', ' ').slice(0, 19));
  /** The landing page's date for the event while it's still ahead, otherwise the same event `fallbackDays` from now. */
  const upcoming = (date: string, fallbackDays: number) => { const d = new Date(`${date}T10:00:00+05:30`); return d.getTime() > now + day ? d : new Date(now + fallbackDays * day); };

  const user = async (name: string, email: string, password: string, role: 'admin' | 'user') => {
    const [id] = await k('users').insert({ name, email, password_hash: await hashPassword(password), role, is_active: true });
    return id as number;
  };
  const pw = Object.fromEntries(DEMO_LOGINS.map((d) => [d.email, d.password]));
  const adminId = await user('Asha Rao', 'admin@skyline.edu', pw['admin@skyline.edu'], 'admin');
  const coreId = await user('Core Admin', 'core@skyline.edu', pw['core@skyline.edu'], 'admin');
  const memberId = await user('Meera Iyer', 'member@skyline.edu', pw['member@skyline.edu'], 'user');
  const studentId = await user('Rohan Das', 'student@skyline.edu', pw['student@skyline.edu'], 'user');
  const lapsedId = await user('Kiran Rao', 'lapsed@skyline.edu', pw['lapsed@skyline.edu'], 'user');

  // Member: paid dues online, active until the academic year ends. Student: profile only, no membership.
  const [meeraMember] = await k('members').insert({ user_id: memberId, student_id: 'SKY2026001', phone: '9810000001', joined_at: ymd(now - 40 * day) });
  await k('members').insert({ user_id: studentId, student_id: 'SKY2026002', phone: '9810000002', joined_at: ymd(now - 5 * day) });
  const pay = async (p: { user_id: number; amount: number; purpose: 'dues' | 'ticket' | 'merch'; reference_type: string; reference_id: number; status: 'paid' | 'pending'; key: string; at: number; provider?: 'razorpay' | 'cash' }) => {
    const [id] = await k('payments').insert({
      user_id: p.user_id, amount: p.amount, currency: 'INR', purpose: p.purpose, reference_type: p.reference_type, reference_id: p.reference_id,
      provider: p.provider ?? 'razorpay', provider_order_id: `order_seed_${p.key}`, provider_payment_id: p.status === 'paid' ? `pay_seed_${p.key}` : null,
      status: p.status, paid_at: p.status === 'paid' ? new Date(p.at) : null,
    });
    return id as number;
  };
  const income = (payment_id: number, amount: number, category: 'dues' | 'ticket' | 'merch', memo: string, at: number, event_id: number | null = null) =>
    k('ledger_entries').insert({ direction: 'in', amount, category, source_type: 'payment', source_id: payment_id, event_id, memo, entered_by: memberId, occurred_at: new Date(at) });

  const [msId] = await k('memberships').insert({ member_id: meeraMember, start_date: ymd(now - 40 * day), expiry_date: academicYearEnd(), status: 'pending' });
  const duesPay = await pay({ user_id: memberId, amount: 500, purpose: 'dues', reference_type: 'membership', reference_id: msId as number, status: 'paid', key: 'dues', at: now - 40 * day });
  await k('memberships').where({ id: msId }).update({ status: 'active', payment_id: duesPay });
  await income(duesPay, 500, 'dues', 'Dues SKY2026001', now - 40 * day);

  // Kiran: paid cash dues last year; that membership ended 30 days ago and hasn't been renewed.
  const [kiranMember] = await k('members').insert({ user_id: lapsedId, student_id: 'SKY2025014', phone: '9810000003', joined_at: ymd(now - 400 * day) });
  const [oldMs] = await k('memberships').insert({ member_id: kiranMember, start_date: ymd(now - 395 * day), expiry_date: ymd(now - 30 * day), status: 'pending' });
  const oldPay = await pay({ user_id: lapsedId, amount: 500, purpose: 'dues', reference_type: 'membership', reference_id: oldMs as number, status: 'paid', key: 'dues_kiran', at: now - 395 * day, provider: 'cash' });
  await k('memberships').where({ id: oldMs }).update({ status: 'expired', payment_id: oldPay });
  await income(oldPay, 500, 'dues', 'Dues SKY2025014', now - 395 * day);

  // Four upcoming published events (names match the landing page) and one past event. Members pay less; CodeStorm is members only.
  const events = [
    { title: 'CodeStorm 2026', description: 'A 24-hour hackathon: build solutions to real-world problems with software, AI and emerging tech, then pitch them to a panel of judges. Teams of 2–4.', starts_at: upcoming('2026-10-24', 14), venue: 'Main Auditorium', capacity: 120, member_price: 0, non_member_price: 0, members_only: true, status: 'published' },
    { title: 'Tech Trivia', description: 'Programming, computer science, cybersecurity and tech trends across rapid-fire and problem-solving rounds. Individual entry.', starts_at: upcoming('2026-10-28', 18), venue: 'Seminar Hall 2', capacity: 80, member_price: 0, non_member_price: 49, status: 'published' },
    { title: 'Rhythm Unplugged', description: 'Music, dance and artistic expression: solo performances, group dance battles and live acts.', starts_at: upcoming('2026-10-31', 21), venue: 'Open-Air Theatre', capacity: 300, member_price: 99, non_member_price: 199, status: 'published' },
    { title: 'Spring Gala', description: 'The formal evening of the year: dinner, a live band and the club awards. Seats are limited.', starts_at: new Date(now + 30 * day), venue: 'Convention Hall', capacity: 2, member_price: 299, non_member_price: 499, status: 'published' },
    { title: 'CodeStorm 2025: Kick-off', description: 'Problem statements, team formation and mentor intros for last year’s hackathon.', starts_at: new Date(now - 45 * day), venue: 'Seminar Hall 2', capacity: 100, member_price: 0, non_member_price: 0, status: 'closed' },
  ];
  const ids: number[] = [];
  for (const e of events) { const [id] = await k('events').insert(e); ids.push(id as number); }
  const [codestorm, , , gala, kickoff] = ids;

  // Meera: registered for CodeStorm (free), holds 1 of the 2 Spring Gala seats (paid), attended the kick-off.
  const ticket = async (event_id: number, starts_at: Date, price: number, status: 'confirmed' | 'checked_in', key: string, at: number) => {
    const [tid] = await k('tickets').insert({ event_id, holder_user_id: memberId, holder_name: 'Meera Iyer', holder_email: 'member@skyline.edu', ticket_type: 'member', price, status, checked_in_at: status === 'checked_in' ? starts_at : null, checked_in_by: status === 'checked_in' ? adminId : null });
    const pid = price > 0
      ? await pay({ user_id: memberId, amount: price, purpose: 'ticket', reference_type: 'ticket', reference_id: tid as number, status: 'paid', key, at })
      : (await k('payments').insert({ user_id: memberId, amount: 0, currency: 'INR', purpose: 'ticket', reference_type: 'ticket', reference_id: tid, provider: 'cash', provider_payment_id: `cash_seed_${key}`, status: 'paid', paid_at: new Date(at) }))[0] as number;
    // A real signed QR (what confirmTicket issues) so the upcoming tickets scan at the door.
    await k('tickets').where({ id: tid }).update({ payment_id: pid, qr_token: signTicketQr({ tid: tid as number, eid: event_id }, new Date(starts_at.getTime() + day)) });
    if (price > 0) await income(pid, price, 'ticket', `Ticket #${tid}`, at, event_id);
  };
  await ticket(codestorm, events[0].starts_at, 0, 'confirmed', 'codestorm', now - 3 * day);
  await ticket(gala, events[3].starts_at, 299, 'confirmed', 'gala', now - 2 * day);
  await ticket(kickoff, events[4].starts_at, 0, 'checked_in', 'kickoff', now - 50 * day);

  await k('announcements').insert([
    { title: 'CodeStorm 2026 registrations are open', body: 'Teams of 2–4, 24 hours, Main Auditorium. Members register free from the Events page.', author_id: adminId, audience: 'all', published_at: new Date(now - 4 * day) },
    { title: 'Spring Gala: last seats', body: 'Only a couple of seats are left for the gala. Members, register from the event page.', author_id: adminId, audience: 'members', published_at: new Date(now - 1 * day) },
  ]);

  // Merch: the landing page's four products and prices; members pay a little less.
  const products = [
    { name: 'T-shirt', description: 'Black cotton tee with the orange Skyline logo on the chest.', image_url: '/media/merch/tshirt.jpg', variants: ['S', 'M', 'L', 'XL'].map((size, i) => ({ size, price: 499, member_price: 449, stock: [10, 20, 15, 6][i] })) },
    { name: 'Bag', description: 'White tote bag with the orange Skyline logo.', image_url: '/media/merch/bag.jpg', variants: [{ size: 'One size', price: 299, member_price: 269, stock: 25 }] },
    { name: 'Water bottle', description: 'Black 750 ml sports bottle with the orange Skyline logo.', image_url: '/media/merch/bottle.jpg', variants: [{ size: '750 ml', price: 399, member_price: 359, stock: 18 }] },
    { name: 'Stickers', description: 'Pack of five Skyline logo stickers.', image_url: '/media/merch/stickers.jpg', variants: [{ size: 'Pack of 5', price: 99, member_price: 79, stock: 100 }] },
  ];
  const variant: Record<string, number> = {};
  for (const { variants, ...p } of products) {
    const [pid] = await k('products').insert({ ...p, is_active: true });
    for (const v of variants) { const [vid] = await k('product_variants').insert({ ...v, product_id: pid, reserved: 0 }); variant[`${p.name}:${v.size}`] = vid as number; }
  }

  // Three orders from Meera at member prices: fulfilled, paid (awaiting hand-over) and pending (stock reserved).
  const order = async (status: 'fulfilled' | 'paid' | 'pending', lines: [string, number, number][], at: number, key: string) => {
    const total = lines.reduce((s, [, qty, unit]) => s + qty * unit, 0);
    const [oid] = await k('orders').insert({ user_id: memberId, subtotal: total, total, status, fulfilled_at: status === 'fulfilled' ? new Date(at + day) : null, created_at: ts(at) });
    await k('order_items').insert(lines.map(([v, qty, unit_price]) => ({ order_id: oid, variant_id: variant[v], qty, unit_price })));
    const pid = await pay({ user_id: memberId, amount: total, purpose: 'merch', reference_type: 'order', reference_id: oid as number, status: status === 'pending' ? 'pending' : 'paid', key, at });
    await k('orders').where({ id: oid }).update({ payment_id: pid });
    for (const [v, qty] of lines) {
      if (status === 'pending') await k('product_variants').where({ id: variant[v] }).increment('reserved', qty);
      else await k('product_variants').where({ id: variant[v] }).decrement('stock', qty);
    }
    if (status !== 'pending') await income(pid, total, 'merch', `Order #${oid}`, at);
  };
  await order('fulfilled', [['T-shirt:M', 1, 449], ['Stickers:Pack of 5', 2, 79]], now - 20 * day, 'o1');
  await order('paid', [['Water bottle:750 ml', 1, 359]], now - 1 * day, 'o2');
  await order('pending', [['Bag:One size', 1, 269]], now, 'o3');

  // Fundraisers: an active bake sale split between both admins (one task done, one overdue, ₹3,500 cash so far)
  // and a completed one. Cash goes through the finance service, so it lands in the ledger like a real entry.
  // Club calendar days (APP_TIMEZONE), like the API's days_left and overdue checks; the UTC date is a day behind before 05:30 IST.
  const clubDay = (days: number) => addDaysYmd(todayYmd(), days);
  const fundraiser = async (f: { name: string; description: string; target_amount: number; starts_on: string; ends_on: string; status: 'active' | 'completed' },
    tasks: [string, number, number, 'todo' | 'doing' | 'done'][], cash: [number, string][]) => {
    const [fid] = await k('fundraisers').insert(f);
    for (const [title, assignee_id, dueIn, status] of tasks) await k('tasks').insert({ fundraiser_id: fid, title, assignee_id, due_on: clubDay(dueIn), status, done_at: status === 'done' ? new Date(now + (dueIn - 1) * day) : null });
    for (const [amount, memo] of cash) await recordFundraiserCash(adminId, fid as number, amount, memo, k);
  };
  await fundraiser({ name: 'Bake Sale', description: 'Cakes and cookies at the main gate to fund the CodeStorm prizes.', target_amount: 10000, starts_on: clubDay(-5), ends_on: clubDay(10), status: 'active' },
    [['Bake cakes', adminId, 9, 'doing'], ['Buy supplies', coreId, -2, 'todo'], ['Manage the table', coreId, 10, 'todo'], ['Promote on campus', adminId, -3, 'done']],
    [[2000, 'Bake sale day 1'], [1500, 'Bake sale day 2']]);
  await fundraiser({ name: 'Freshers Car Wash', description: 'Weekend car wash in the staff car park for the freshers welcome.', target_amount: 5000, starts_on: clubDay(-40), ends_on: clubDay(-30), status: 'completed' },
    [['Book the car park', adminId, -42, 'done'], ['Buckets and soap', coreId, -35, 'done']],
    [[5200, 'Car wash takings']]);
}
