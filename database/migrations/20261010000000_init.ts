import type { Knex } from 'knex';

const base = (t: Knex.CreateTableBuilder, k: Knex) => {
  t.bigIncrements('id');
  t.timestamp('created_at').notNullable().defaultTo(k.fn.now());
  t.timestamp('updated_at').notNullable().defaultTo(k.fn.now());
};

export async function up(k: Knex): Promise<void> {
  await k.schema.createTable('users', (t) => {
    base(t, k);
    t.string('name', 120).notNullable();
    t.string('email', 190).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.enum('role', ['member', 'volunteer', 'admin', 'treasurer']).notNullable().defaultTo('member');
    t.boolean('is_active').notNullable().defaultTo(true);
  });

  await k.schema.createTable('members', (t) => {
    base(t, k);
    t.bigInteger('user_id').unsigned().notNullable().unique().references('users.id');
    t.string('student_id', 40).notNullable().unique();
    t.string('phone', 30);
    t.date('joined_at').notNullable();
  });

  await k.schema.createTable('payments', (t) => {
    base(t, k);
    t.bigInteger('user_id').unsigned().references('users.id');
    t.decimal('amount', 12, 2).notNullable();
    t.string('currency', 3).notNullable().defaultTo('INR');
    t.enum('purpose', ['dues', 'ticket', 'merch']).notNullable();
    t.string('reference_type', 30).notNullable();
    t.bigInteger('reference_id').unsigned().notNullable();
    t.enum('provider', ['razorpay', 'stripe', 'cash']).notNullable();
    t.string('provider_order_id', 120);
    t.string('provider_payment_id', 120).unique();
    t.enum('status', ['pending', 'paid', 'failed', 'refunded']).notNullable().defaultTo('pending');
    t.timestamp('paid_at').nullable();
    t.index(['reference_type', 'reference_id']);
  });

  await k.schema.createTable('memberships', (t) => {
    base(t, k);
    t.bigInteger('member_id').unsigned().notNullable().references('members.id');
    t.date('start_date').notNullable();
    t.date('expiry_date').notNullable();
    t.enum('status', ['pending', 'active', 'expired']).notNullable().defaultTo('pending');
    t.bigInteger('payment_id').unsigned().references('payments.id');
    t.timestamp('reminder_sent_at').nullable();
    t.index(['member_id', 'status', 'expiry_date']);
  });

  await k.schema.createTable('events', (t) => {
    base(t, k);
    t.string('title', 200).notNullable();
    t.text('description');
    t.timestamp('starts_at').notNullable();
    t.string('venue', 200);
    t.integer('capacity').unsigned().notNullable();
    t.decimal('member_price', 12, 2).notNullable().defaultTo(0);
    t.decimal('non_member_price', 12, 2).notNullable().defaultTo(0);
    t.timestamp('sales_open_at').nullable();
    t.timestamp('sales_close_at').nullable();
    t.enum('status', ['draft', 'published', 'closed']).notNullable().defaultTo('draft');
  });

  await k.schema.createTable('tickets', (t) => {
    base(t, k);
    t.bigInteger('event_id').unsigned().notNullable().references('events.id');
    t.bigInteger('holder_user_id').unsigned().nullable().references('users.id');
    t.string('holder_name', 120).notNullable();
    t.string('holder_email', 190).notNullable();
    t.enum('ticket_type', ['member', 'non_member']).notNullable();
    t.decimal('price', 12, 2).notNullable();
    t.bigInteger('payment_id').unsigned().references('payments.id');
    t.string('qr_token', 512).unique();
    t.enum('status', ['pending', 'confirmed', 'checked_in', 'cancelled']).notNullable().defaultTo('pending');
    t.timestamp('checked_in_at').nullable();
    t.bigInteger('checked_in_by').unsigned().nullable().references('users.id');
    t.index(['event_id', 'status']);
  });

  await k.schema.createTable('announcements', (t) => {
    base(t, k);
    t.string('title', 200).notNullable();
    t.text('body').notNullable();
    t.bigInteger('author_id').unsigned().notNullable().references('users.id');
    t.enum('audience', ['all', 'members']).notNullable().defaultTo('all');
    t.timestamp('published_at').notNullable().defaultTo(k.fn.now());
    t.timestamp('email_sent_at').nullable();
    t.integer('email_recipient_count').unsigned().nullable();
  });

  await k.schema.createTable('products', (t) => {
    base(t, k);
    t.string('name', 200).notNullable();
    t.text('description');
    t.string('image_url', 500);
    t.boolean('is_active').notNullable().defaultTo(true);
  });

  await k.schema.createTable('product_variants', (t) => {
    base(t, k);
    t.bigInteger('product_id').unsigned().notNullable().references('products.id');
    t.string('size', 20).notNullable();
    t.decimal('price', 12, 2).notNullable();
    t.decimal('member_price', 12, 2).notNullable();
    t.integer('stock').unsigned().notNullable().defaultTo(0);
    t.integer('reserved').unsigned().notNullable().defaultTo(0);
    t.unique(['product_id', 'size']);
  });

  await k.schema.createTable('orders', (t) => {
    base(t, k);
    t.bigInteger('user_id').unsigned().notNullable().references('users.id');
    t.decimal('subtotal', 12, 2).notNullable();
    t.decimal('total', 12, 2).notNullable();
    t.bigInteger('payment_id').unsigned().references('payments.id');
    t.enum('status', ['pending', 'paid', 'fulfilled', 'cancelled']).notNullable().defaultTo('pending');
    t.timestamp('fulfilled_at').nullable();
  });

  await k.schema.createTable('order_items', (t) => {
    base(t, k);
    t.bigInteger('order_id').unsigned().notNullable().references('orders.id');
    t.bigInteger('variant_id').unsigned().notNullable().references('product_variants.id');
    t.integer('qty').unsigned().notNullable();
    t.decimal('unit_price', 12, 2).notNullable();
  });

  await k.schema.createTable('fundraisers', (t) => {
    base(t, k);
    t.string('name', 200).notNullable();
    t.text('description');
    t.decimal('target_amount', 12, 2).notNullable().defaultTo(0);
    t.decimal('budget', 12, 2).nullable();
    t.date('starts_on');
    t.date('ends_on');
    t.enum('status', ['planning', 'active', 'closed']).notNullable().defaultTo('planning');
  });

  await k.schema.createTable('tasks', (t) => {
    base(t, k);
    t.bigInteger('fundraiser_id').unsigned().notNullable().references('fundraisers.id');
    t.string('title', 200).notNullable();
    t.bigInteger('assignee_id').unsigned().nullable().references('users.id');
    t.date('due_on');
    t.enum('status', ['todo', 'doing', 'done']).notNullable().defaultTo('todo');
    t.timestamp('done_at').nullable();
  });

  await k.schema.createTable('expenses', (t) => {
    base(t, k);
    t.bigInteger('submitted_by').unsigned().notNullable().references('users.id');
    t.bigInteger('event_id').unsigned().nullable().references('events.id');
    t.bigInteger('fundraiser_id').unsigned().nullable().references('fundraisers.id');
    t.decimal('amount', 12, 2).notNullable();
    t.string('category', 60).notNullable();
    t.text('description');
    t.text('receipt_url');
    t.string('receipt_hash', 64);
    t.enum('status', ['submitted', 'approved', 'rejected', 'paid']).notNullable().defaultTo('submitted');
    t.bigInteger('reviewed_by').unsigned().nullable().references('users.id');
    t.timestamp('reviewed_at').nullable();
    t.text('review_note');
    t.json('flags');
    t.index(['status']);
    t.index(['receipt_hash']);
  });

  await k.schema.createTable('ledger_entries', (t) => {
    base(t, k);
    t.enum('direction', ['in', 'out']).notNullable();
    t.decimal('amount', 12, 2).notNullable();
    t.enum('category', ['dues', 'ticket', 'merch', 'fundraiser', 'reimbursement', 'other']).notNullable();
    t.string('source_type', 30).notNullable();
    t.bigInteger('source_id').unsigned().notNullable();
    t.bigInteger('event_id').unsigned().nullable().references('events.id');
    t.bigInteger('fundraiser_id').unsigned().nullable().references('fundraisers.id');
    t.string('memo', 500);
    t.bigInteger('entered_by').unsigned().nullable().references('users.id');
    t.timestamp('occurred_at').notNullable().defaultTo(k.fn.now());
    t.unique(['source_type', 'source_id']);
    t.index(['occurred_at']);
  });

  await k.schema.createTable('cash_receipts', (t) => {
    base(t, k);
    t.bigInteger('fundraiser_id').unsigned().nullable().references('fundraisers.id');
    t.bigInteger('event_id').unsigned().nullable().references('events.id');
    t.decimal('amount', 12, 2).notNullable();
    t.string('memo', 500);
    t.bigInteger('entered_by').unsigned().notNullable().references('users.id');
  });

  await k.schema.createTable('ai_audit', (t) => {
    base(t, k);
    t.bigInteger('user_id').unsigned().notNullable().references('users.id');
    t.text('prompt').notNullable();
    t.json('tool_calls');
    t.text('response');
    t.string('proposal_id', 64);
    t.timestamp('confirmed_at').nullable();
  });

  await k.schema.createTable('ai_proposals', (t) => {
    base(t, k);
    t.string('token', 64).notNullable().unique();
    t.bigInteger('user_id').unsigned().notNullable().references('users.id');
    t.string('required_role', 20).notNullable();
    t.string('action', 60).notNullable();
    t.json('payload').notNullable();
    t.timestamp('executed_at').nullable();
  });

  await k.schema.createTable('webhook_events', (t) => {
    base(t, k);
    t.string('provider', 20).notNullable();
    t.text('raw_body').notNullable();
    t.boolean('signature_ok').notNullable();
    t.string('result', 60);
  });
}

export async function down(k: Knex): Promise<void> {
  for (const t of ['webhook_events', 'ai_proposals', 'ai_audit', 'cash_receipts', 'ledger_entries', 'expenses', 'tasks', 'fundraisers',
    'order_items', 'orders', 'product_variants', 'products', 'announcements', 'tickets', 'events', 'memberships',
    'payments', 'members', 'users']) {
    await k.schema.dropTableIfExists(t);
  }
}
