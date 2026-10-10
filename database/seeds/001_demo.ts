import type { Knex } from 'knex';
import bcrypt from '../../backend/node_modules/bcryptjs';

/** Demo data: ~50 members, 5 events, ~40 ledger rows. Password for every demo user: `password123`. */
export async function seed(k: Knex): Promise<void> {
  for (const t of ['webhook_events', 'ai_proposals', 'ai_audit', 'cash_receipts', 'ledger_entries', 'expenses', 'tasks', 'fundraisers', 'order_items', 'orders', 'product_variants', 'products', 'announcements', 'tickets', 'events', 'memberships', 'payments', 'members', 'users']) await k(t).del();
  const hash = await bcrypt.hash('password123', 10);
  const day = 86_400_000; const now = Date.now();
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const staff = [
    { name: 'Asha Admin', email: 'admin@ssa.test', role: 'admin' },
    { name: 'Tarun Treasurer', email: 'treasurer@ssa.test', role: 'treasurer' },
    { name: 'Vikram Volunteer', email: 'volunteer@ssa.test', role: 'volunteer' },
  ];
  const first = ['Aarav', 'Diya', 'Ishaan', 'Kiara', 'Rohan', 'Sara', 'Vihaan', 'Zara', 'Arjun', 'Meera', 'Kabir', 'Anaya', 'Dev', 'Riya', 'Yash', 'Nisha', 'Om', 'Tara', 'Rahul', 'Pooja'];
  const last = ['Sharma', 'Patel', 'Reddy', 'Nair', 'Singh', 'Iyer', 'Khan', 'Das', 'Mehta', 'Rao'];
  const members = Array.from({ length: 50 }, (_, i) => ({ name: `${first[i % 20]} ${last[Math.floor(i / 5) % 10]}`, email: `member${i + 1}@ssa.test`, role: 'member' }));
  const userIds: number[] = [];
  for (const u of [...staff, ...members]) { const [id] = await k('users').insert({ ...u, password_hash: hash, is_active: true }); userIds.push(id as number); }
  const [adminId, treasurerId, volunteerId] = userIds;
  const memberUserIds = userIds.slice(3);

  // Members + memberships: 40 active (5 expiring soon), 6 expired, 4 none
  const memberIds: number[] = [];
  for (let i = 0; i < memberUserIds.length; i++) {
    const [mid] = await k('members').insert({ user_id: memberUserIds[i], student_id: `SKY${String(2024000 + i + 1)}`, phone: `98${String(10000000 + i * 7919).slice(0, 8)}`, joined_at: ymd(now - (365 - i * 5) * day) });
    memberIds.push(mid as number);
    if (i >= 46) continue;
    const expired = i >= 40;
    const expiring = i < 5;
    const expiry = expired ? ymd(now - (10 + i) * day) : expiring ? ymd(now + (3 + i * 2) * day) : ymd(now + 200 * day);
    const [pid] = await k('payments').insert({ user_id: memberUserIds[i], amount: 500, currency: 'INR', purpose: 'dues', reference_type: 'membership', reference_id: 0, provider: i % 3 === 0 ? 'cash' : 'razorpay', provider_payment_id: `seed_dues_${i}`, status: 'paid', paid_at: new Date(now - (300 - i * 3) * day) });
    const [msid] = await k('memberships').insert({ member_id: mid, start_date: ymd(now - 300 * day), expiry_date: expiry, status: expired ? 'expired' : 'active', payment_id: pid });
    await k('payments').where({ id: pid }).update({ reference_id: msid });
    await k('ledger_entries').insert({ direction: 'in', amount: 500, category: 'dues', source_type: 'payment', source_id: pid, memo: `Dues SKY${2024000 + i + 1}`, entered_by: treasurerId, occurred_at: new Date(now - (300 - i * 3) * day) });
  }

  // Events
  const events = [
    { title: 'Spring Gala', description: 'Annual formal with dinner and live band.', starts_at: new Date(now + 20 * day), venue: 'Main Hall', capacity: 120, member_price: 300, non_member_price: 500, status: 'published' },
    { title: 'Welcome Mixer', description: 'Meet the committee.', starts_at: new Date(now - 60 * day), venue: 'Quad', capacity: 80, member_price: 0, non_member_price: 50, status: 'closed' },
    { title: 'Tech Talk: Agentic AI', description: 'Guest speaker session.', starts_at: new Date(now + 7 * day), venue: 'Room 204', capacity: 40, member_price: 0, non_member_price: 100, status: 'published' },
    { title: 'Movie Night', description: 'Outdoor screening.', starts_at: new Date(now - 15 * day), venue: 'Lawn', capacity: 100, member_price: 50, non_member_price: 100, status: 'closed' },
    { title: 'Alumni Dinner (draft)', description: 'Planning.', starts_at: new Date(now + 60 * day), venue: 'TBD', capacity: 60, member_price: 400, non_member_price: 700, status: 'draft' },
  ];
  const eventIds: number[] = [];
  for (const e of events) { const [id] = await k('events').insert(e); eventIds.push(id as number); }
  // Past event tickets (Movie Night): 30 sold, 24 checked in
  for (let i = 0; i < 30; i++) {
    const uid = memberUserIds[i]; const price = i < 20 ? 50 : 100;
    const [pid] = await k('payments').insert({ user_id: uid, amount: price, currency: 'INR', purpose: 'ticket', reference_type: 'ticket', reference_id: 0, provider: 'razorpay', provider_payment_id: `seed_tkt_${i}`, status: 'paid', paid_at: new Date(now - 20 * day) });
    const [tid] = await k('tickets').insert({ event_id: eventIds[3], holder_user_id: uid, holder_name: members[i].name, holder_email: members[i].email, ticket_type: i < 20 ? 'member' : 'non_member', price, payment_id: pid, qr_token: `seed_qr_${i}`, status: i < 24 ? 'checked_in' : 'confirmed', checked_in_at: i < 24 ? new Date(now - 15 * day) : null, checked_in_by: i < 24 ? volunteerId : null });
    await k('payments').where({ id: pid }).update({ reference_id: tid });
    await k('ledger_entries').insert({ direction: 'in', amount: price, category: 'ticket', source_type: 'payment', source_id: pid, event_id: eventIds[3], memo: `Ticket #${tid} Movie Night`, entered_by: uid, occurred_at: new Date(now - 20 * day) });
  }
  // Upcoming gala: 12 confirmed
  for (let i = 30; i < 42; i++) {
    const uid = memberUserIds[i];
    const [pid] = await k('payments').insert({ user_id: uid, amount: 300, currency: 'INR', purpose: 'ticket', reference_type: 'ticket', reference_id: 0, provider: 'razorpay', provider_payment_id: `seed_gala_${i}`, status: 'paid', paid_at: new Date(now - 2 * day) });
    const [tid] = await k('tickets').insert({ event_id: eventIds[0], holder_user_id: uid, holder_name: members[i].name, holder_email: members[i].email, ticket_type: 'member', price: 300, payment_id: pid, qr_token: `seed_gala_qr_${i}`, status: 'confirmed' });
    await k('payments').where({ id: pid }).update({ reference_id: tid });
    await k('ledger_entries').insert({ direction: 'in', amount: 300, category: 'ticket', source_type: 'payment', source_id: pid, event_id: eventIds[0], memo: `Ticket #${tid} Spring Gala`, entered_by: uid, occurred_at: new Date(now - 2 * day) });
  }

  await k('announcements').insert([
    { title: 'Welcome to the new semester!', body: 'First general meeting is next Tuesday at 5pm in Room 204.', author_id: adminId, audience: 'all', published_at: new Date(now - 30 * day), email_sent_at: new Date(now - 30 * day), email_recipient_count: 53 },
    { title: 'Gala tickets on sale', body: 'Members get ₹200 off. Limited seats.', author_id: adminId, audience: 'all', published_at: new Date(now - 5 * day), email_sent_at: new Date(now - 5 * day), email_recipient_count: 53 },
    { title: 'Members-only: AGM voting', body: 'Vote for next year\'s committee by Friday.', author_id: adminId, audience: 'members', published_at: new Date(now - 1 * day), email_sent_at: new Date(now - 1 * day), email_recipient_count: 40 },
  ]);

  const [hoodie] = await k('products').insert({ name: 'SSA Hoodie', description: 'Navy, embroidered logo.', is_active: true });
  const [tee] = await k('products').insert({ name: 'SSA T-shirt', description: 'White, printed.', is_active: true });
  await k('product_variants').insert([
    ...['S', 'M', 'L', 'XL'].map((size, i) => ({ product_id: hoodie, size, price: 1200, member_price: 999, stock: [8, 15, 12, 3][i], reserved: 0 })),
    ...['S', 'M', 'L'].map((size, i) => ({ product_id: tee, size, price: 500, member_price: 400, stock: [20, 25, 10][i], reserved: 0 })),
  ]);

  const [bake] = await k('fundraisers').insert({ name: 'Bake Sale for Library Fund', description: 'Two-day bake sale.', target_amount: 15000, budget: 4000, starts_on: ymd(now - 10 * day), ends_on: ymd(now + 10 * day), status: 'active' });
  const [run] = await k('fundraisers').insert({ name: 'Charity 5K', description: 'Sponsored run.', target_amount: 50000, budget: 12000, starts_on: ymd(now + 30 * day), ends_on: ymd(now + 45 * day), status: 'planning' });
  await k('tasks').insert([
    { fundraiser_id: bake, title: 'Book the stall', assignee_id: volunteerId, due_on: ymd(now - 8 * day), status: 'done', done_at: new Date(now - 9 * day) },
    { fundraiser_id: bake, title: 'Print posters', assignee_id: volunteerId, due_on: ymd(now - 2 * day), status: 'doing' },
    { fundraiser_id: bake, title: 'Collect baked goods', assignee_id: memberUserIds[0], due_on: ymd(now + 1 * day), status: 'todo' },
    { fundraiser_id: bake, title: 'Arrange cash box', assignee_id: null, due_on: ymd(now + 2 * day), status: 'todo' },
    { fundraiser_id: run, title: 'Get route permit', assignee_id: adminId, due_on: ymd(now + 15 * day), status: 'todo' },
    { fundraiser_id: run, title: 'Find sponsors', assignee_id: null, due_on: ymd(now + 20 * day), status: 'todo' },
  ]);
  for (const [i, amt] of [2400, 3100, 1800].entries()) {
    const [cid] = await k('cash_receipts').insert({ fundraiser_id: bake, amount: amt, memo: `Bake sale day ${i + 1}`, entered_by: treasurerId });
    await k('ledger_entries').insert({ direction: 'in', amount: amt, category: 'fundraiser', source_type: 'cash_receipt', source_id: cid, fundraiser_id: bake, memo: `Bake sale day ${i + 1}`, entered_by: treasurerId, occurred_at: new Date(now - (8 - i * 2) * day) });
  }

  // Expenses: 3 paid, 1 approved, 2 submitted (one flagged)
  const expenses = [
    { submitted_by: volunteerId, event_id: eventIds[3], amount: 1500, category: 'venue', description: 'Projector rental', status: 'paid' },
    { submitted_by: volunteerId, event_id: eventIds[3], amount: 800, category: 'food', description: 'Popcorn and drinks', status: 'paid' },
    { submitted_by: memberUserIds[0], fundraiser_id: bake, amount: 950, category: 'supplies', description: 'Flour, sugar, butter', status: 'paid' },
    { submitted_by: volunteerId, fundraiser_id: bake, amount: 600, category: 'printing', description: 'Posters', status: 'approved' },
    { submitted_by: volunteerId, event_id: eventIds[0], amount: 2200, category: 'decor', description: 'Gala decorations deposit', status: 'submitted', flags: JSON.stringify([]) },
    { submitted_by: memberUserIds[1], amount: 9800, category: 'food', description: 'Catering advance', status: 'submitted', flags: JSON.stringify([{ code: 'HIGH_AMOUNT', rule: 'Amount > 2.5× median of approved food expenses' }, { code: 'NO_RECEIPT', rule: 'Amount > ₹200 without a receipt' }]) },
  ];
  for (const x of expenses) {
    const reviewed = x.status !== 'submitted';
    const [id] = await k('expenses').insert({ ...x, receipt_hash: reviewed ? `seedhash${x.amount}` : null, reviewed_by: reviewed ? treasurerId : null, reviewed_at: reviewed ? new Date(now - 5 * day) : null });
    if (x.status === 'paid') await k('ledger_entries').insert({ direction: 'out', amount: x.amount, category: 'reimbursement', source_type: 'expense', source_id: id, event_id: x.event_id ?? null, fundraiser_id: x.fundraiser_id ?? null, memo: x.description, entered_by: treasurerId, occurred_at: new Date(now - 4 * day) });
  }
}
