export type Role = 'admin' | 'user';
export type User = { id: number; name: string; email: string; role: Role };
export type Event = { id: number; title: string; description?: string; starts_at: string; venue?: string; capacity: number; member_price: number; status: 'draft' | 'published' | 'closed'; seats_left: number; price: number; viewer: EventViewer; sales_open_at?: string; sales_close_at?: string };
export type EventViewer = { logged_in: boolean; is_member: boolean; registered: boolean; ticket: { id: number; status: string } | null };
export type Ticket = { id: number; event_id: number; event_title?: string; starts_at?: string; venue?: string; holder_name: string; ticket_type: string; price: number; status: string; qr_token?: string; qr_data_url?: string; checked_in_at?: string };
export type Checkout = { provider: string; order_id: string; amount: number; currency: string; key_id?: string; payment_id: number; demo: boolean } | null;
/** One membership period and its dues payment (`method` null when nothing was paid). */
export type DuesRow = { membership_id: number; start_date: string; expiry_date: string; status: 'pending' | 'active' | 'expired'; amount: number | null; method: 'online' | 'cash' | null; paid: boolean; paid_at: string | null };
export type Me = { user: User; member: any; membership: any; active: boolean; is_member: boolean;
  /** How far the member is covered (includes a renewal paid ahead). */ membership_expires: string | null; days_left: number | null;
  /** Renewal is open (within 30 days of expiry, or expired / never a member). */ can_renew: boolean;
  renewal: { start_date: string; expiry_date: string } | null; dues: DuesRow[]; qr_token: string | null; tickets: Ticket[] };
export type Announcement = { id: number; title: string; body: string; audience: string; published_at: string; author_name: string; email_recipient_count?: number };
export type Product = { id: number; name: string; description?: string; image_url?: string; is_active: boolean; variants: { id: number; size: string; price: number; member_price: number; stock: number; reserved: number; available: number; price_for_you: number }[] };
export type Fundraiser = { id: number; name: string; description?: string; target_amount: number; budget?: number; starts_on?: string; ends_on?: string; status: string; raised: number; spent: number; progress: number | null; tasks_total: number; tasks_done: number; tasks_overdue: number };
export type Task = { id: number; fundraiser_id: number; title: string; assignee_id: number | null; assignee_name?: string; due_on: string | null; status: 'todo' | 'doing' | 'done'; overdue?: boolean };
export type Flag = { code: string; rule: string };
export type Expense = { id: number; submitted_by: number; submitted_by_name?: string; amount: number; category: string; description?: string; receipt_url?: string | null; status: string; flags: Flag[]; review_note?: string; event_id?: number; fundraiser_id?: number; created_at: string };
export type Summary = { balance: number; total_in: number; total_out: number; by_category: { category: string; direction: string; total: number }[]; by_event: { event_id: number; title: string; direction: string; total: number }[]; by_fundraiser: { fundraiser_id: number; name: string; target_amount: number; direction: string; total: number }[]; by_month: { month: string; direction: string; total: number }[] };
export type LedgerRow = { id: number; occurred_at: string; direction: 'in' | 'out'; amount: number; category: string; source_type: string; source_id: number; event_title?: string; fundraiser_name?: string; memo?: string; entered_by_name?: string };
export type Member = { id: number; student_id: string; phone?: string; name: string; email: string; role: Role; membership_status: string | null; expiry_date: string | null; start_date?: string | null; joined_at?: string | null;
  /** Dues for the latest membership period. */ dues_amount: number | string | null; dues_provider: string | null; dues_status: string | null; dues_paid_at: string | null };
export type EventReport = { event: Event; sold: number; checked_in: number; no_show: number; pending: number; cancelled: number; by_type: { member: number; non_member: number }; revenue: number; spent: number; breakdown?: { ticket_type: string; status: string; n: number | string }[] };
export type MembershipOffer = { price: number; currency: string; benefits: string[]; valid_until?: string };
/** 403 body from members-only endpoints (POST /events/:id/register). */
export type MembershipRequired = { code: 'MEMBERSHIP_REQUIRED'; message: string; membership: MembershipOffer };
/** Body of POST /events/:id/register. `resumed` = an existing pending ticket's checkout was returned (200). */
export type Registration = { ticket: Ticket; checkout: Checkout; resumed: boolean };
export type OrderItem = { product: string; size: string; qty: number; unit_price: number; variant_id?: number; product_id?: number };
export type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'cancelled';
export type Order = { id: number; created_at: string; total: number; status: OrderStatus; payment_id: number | null; payment_status: string | null; fulfilled_at: string | null; items: OrderItem[] };
export type AdminOrderRow = { id: number; created_at: string; customer: { id: number; name: string; email: string; is_member: boolean }; items: OrderItem[]; total: number; payment_status: string | null; status: OrderStatus };
export type AdminOrdersPage = { rows: AdminOrderRow[]; total: number; page: number; page_size: number };
export type AdminOverview = { members: { active: number; total: number }; upcoming_registrations: number; orders_today: { count: number; paid: number; revenue: number }; pending_orders: number; balance: number; as_of: string };
export type EventRegistrationRow = { id: number; created_at: string; holder_user_id: number | null; holder_name: string; holder_email: string; ticket_type: string; price: number; status: string; checked_in_at: string | null; user_name: string | null; payment_status: string | null };
