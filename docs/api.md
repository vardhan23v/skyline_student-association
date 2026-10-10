# API reference (Phase 1: two roles)

Base path `/api`. JSON in and out. Auth is `Authorization: Bearer <JWT>` from `/auth/login` or `/auth/register` (24 h, HS256).

## Roles

| Role | Who | Can do |
|---|---|---|
| `admin` | Club leads | Everything below under `/api/admin/*`: events, registrations, check-in, members and cash dues, products and stock, orders, announcements, ledger, expenses, fundraisers, tasks |
| `user` | Any registered student | Browse; buy a membership; register for events **while a member**; order merch; see their own membership, tickets and orders |

`admin` ⊇ `user`. **Membership is a status, not a role**: a user is a member while they have a `memberships` row with `status = 'active'` and `expiry_date >= today` (club time zone, `APP_TIMEZONE`). `GET /me` returns `is_member` and `membership_expires`.

The backend is the source of truth for permissions:
- every `/api/admin/*` route sits behind one `requireRole('admin')` on the admin router, so a non-admin gets **403** and an anonymous caller **401** on all of them;
- members-only routes use `requireMember`;
- services check ownership, so a user only reads their own tickets, orders and membership.

Tokens minted before the two-role migration carry a retired role (`member`, `treasurer`…) and are rejected with 401, so those users sign in again.

## Error shape

```json
{ "error": "This event is sold out", "message": "This event is sold out", "code": "SOLD_OUT" }
```

`code` is stable; branch on it, not on the text.

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | No token, or an invalid or expired one |
| `FORBIDDEN` | 403 | Wrong role, or not the owner |
| `MEMBERSHIP_REQUIRED` | 403 | Members-only. The body also has `membership: { price, currency, benefits[] }` for the membership card |
| `ALREADY_REGISTERED` | 409 | Holder already has a confirmed or used ticket (`ticket_id` included) |
| `SOLD_OUT` | 409 | No seats left |
| `REGISTRATION_NOT_OPEN` | 400 | Registration window not open yet |
| `REGISTRATION_CLOSED` | 400 | Registration window closed, or the event has started |
| `ALREADY_MEMBER` | 409 | Membership already active |
| `PROFILE_REQUIRED` | 400 | The user has no student ID on file: send `student_id` with `POST /memberships` |
| `STUDENT_ID_TAKEN` | 409 | That student ID belongs to another account |
| `INVALID_TRANSITION` | 409 | Order status change not allowed (`from`, `to` and `allowed` included) |
| `INSUFFICIENT_STOCK` | 409 | The stock behind the order is gone |
| `PAYMENT_FAILED` | 409 | Payment failed; start a new checkout |
| `BAD_REQUEST` | 400 | Validation failed (`details` has the field errors) |
| `NOT_FOUND` | 404 | Not found |
| `CONFLICT` | 409 | Generic conflict |

## Checkout

Paid actions return a `checkout` object:

```json
{ "provider": "razorpay", "order_id": "order_…", "amount": 299, "currency": "INR", "key_id": "rzp_…", "payment_id": 42, "demo": false }
```

Paid actions are buying a membership, registering for a paid event, and placing an order.

- **With Razorpay keys:** open Razorpay Checkout with `order_id` and `key_id`. The signed webhook (`POST /api/webhooks/payment`) settles the payment.
- **Demo mode:** set `DEMO_PAYMENTS=true` and leave the Razorpay keys unset. `checkout.demo` is then `true`, and the client calls `POST /api/payments/demo-confirm/{payment_id}`, which runs the same settle path as the webhook.

Whichever way the payment settles, the result is identical: memberships activate, tickets confirm and get a QR, stock moves, and exactly one ledger row is written.

Unpaid holds (a ticket seat, reserved stock) expire after `PENDING_HOLD_MINUTES`, 15 by default.

## Routes

**Status** is relative to the code before Phase 1 (commit `b2a07a4`). It is one of:
- **added**: a new route;
- **changed**: same path, but different behaviour or a different response;
- **moved**: same behaviour, new path under `/api/admin`;
- **removed**: the route no longer exists.

### Public and signed-in users

| Method | Path | Role | Purpose | Status |
|---|---|---|---|---|
| GET | `/health` (no `/api`) | public | Railway health check, plain `ok` | changed (now served by Express) |
| GET | `/api/health` | public | JSON health | unchanged |
| POST | `/api/auth/register` | public | Create an account. Always role `user`; optional `student_id` creates the member profile | changed (role `user`) |
| POST | `/api/auth/login` | public | Returns `{ user, token }` | unchanged |
| GET | `/api/me` | user | Account, membership (`is_member`, `membership_expires`, member QR) and tickets | changed (+`is_member`, `membership_expires`) |
| GET | `/api/membership/info` | public | `{ price, currency, benefits[], valid_until }` for the membership card | added |
| POST | `/api/memberships` | user | Start a membership purchase. Body `{ student_id?, phone? }`. Returns `{ membership_id, payment_id, amount, expiry_date, checkout }` | changed (any user; takes `student_id`; `ALREADY_MEMBER` is 409) |
| POST | `/api/payments/demo-confirm/:paymentId` | user (payer only) | Confirm a pending payment in demo mode. 404 unless `DEMO_PAYMENTS=true` and no Razorpay keys | added |
| GET | `/api/events` | public | Published and closed events. Each has `seats_left`, `price` (member price) and `viewer: { logged_in, is_member, registered, ticket }` | changed (`viewer`; drafts moved to admin) |
| GET | `/api/events/:id` | public | One event, same shape | changed |
| POST | `/api/events/:id/register` | member | Register; details below | added |
| DELETE | `/api/events/:id/register` | user (holder) | Cancel before the event starts. Frees the seat; a paid ticket gets a reversing ledger row and its payment is marked refunded | added |
| POST | `/api/events/:id/tickets` | n/a | Old ticket purchase (members and non-members) | **removed** |
| POST | `/api/events/:id/cash-ticket` | n/a | Old cash door sale | **removed** |
| GET | `/api/tickets` | user | My tickets | unchanged |
| GET | `/api/tickets/:id` | holder or admin | One ticket with its QR image | unchanged |
| GET | `/api/announcements` | public | Archive; members-only posts for members and admins | unchanged |
| GET | `/api/products` | public | Active products with variants, `available` and `price_for_you` (member price for members) | changed (inactive products moved to admin) |
| POST | `/api/orders` | user | Body `{ items: [{ variant_id, qty }] }`. Reserves stock, snapshots `unit_price`, returns `{ order, items, checkout }` | changed (any signed-in user) |
| GET | `/api/orders/mine` | user | My orders with items and `payment_status` | added |
| GET | `/api/orders/:id` | owner or admin | One order with items | changed (item shape, `payment_status`) |
| GET | `/api/orders` | n/a | Old list | **removed** (use `/orders/mine` or `/admin/orders`) |
| PATCH | `/api/orders/:id/fulfil` | n/a | Old fulfil | **removed** (use `PATCH /admin/orders/:id`) |
| GET | `/api/finance/summary` | user | Balance and totals for transparency | unchanged |
| GET | `/api/fundraisers`, `/api/fundraisers/:id` | user | Progress from the ledger | unchanged |
| GET | `/api/expenses/:id/receipt` | signed link | Receipt file behind the HMAC link in admin expense rows | unchanged |
| POST | `/api/webhooks/payment` | Razorpay (HMAC) | Settles payments, idempotent | changed (shared settle path; contract unchanged) |
| POST | `/api/ai/ask` | user | AI Secretary. Tools are filtered by role: users get `getFinanceSummary`, admins get all | changed (two roles) |
| POST | `/api/ai/confirm/:proposalId` | admin (requester only) | Execute a drafted announcement or expense review | changed (two roles) |
| GET | `/api/expenses` | n/a | Old own-expense list for volunteers | **removed** (expenses are admin-only) |
| PATCH | `/api/tasks/:id` | n/a | Old volunteer self-assign | **removed** (use `PATCH /admin/tasks/:id`) |

#### `POST /api/events/:id/register`

All of this runs in one transaction:
1. Lock the event row (`SELECT … FOR UPDATE`).
2. Check that the event is published, the sales window is open and it hasn't started.
3. Re-check the membership.
4. Check that the user isn't already registered, enforced by `UNIQUE(event_id, holder_user_id)`.
5. Check the seats.
6. Create the ticket at `member_price`.

The result depends on the price and on what the user already holds:
- **Free event:** the ticket is confirmed at once with a signed `qr_token`. Response **201**, `checkout: null`.
- **Paid event:** the ticket is `pending` and holds the seat. The response is **201** with a `checkout`. The ticket confirms, gets its QR and writes its ledger row when the payment settles.
- **Pending ticket already exists:** registering again resumes that checkout. Response **200**, `resumed: true`.
- **Cancelled ticket already exists:** the row is reused.

Errors are **401** (signed out), **403** `MEMBERSHIP_REQUIRED`, **409** `ALREADY_REGISTERED` or `SOLD_OUT`, and **400** `REGISTRATION_NOT_OPEN` or `REGISTRATION_CLOSED`.

### Admin: `/api/admin/*`, all `requireRole('admin')`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/api/admin/overview` | `{ members: { active, total }, upcoming_registrations, orders_today: { count, paid, revenue }, pending_orders, balance, as_of }`. "Today" is the club's calendar day | added |
| GET | `/api/admin/events` | All events including drafts | added |
| POST | `/api/admin/events` | Create (`title, starts_at, capacity, member_price, status?, venue?, description?, sales_open_at?, sales_close_at?`) | moved from `POST /events` |
| GET | `/api/admin/events/:id` | One event including drafts | added |
| PATCH | `/api/admin/events/:id` | Edit, publish or close | moved from `PATCH /events/:id` |
| GET | `/api/admin/events/:id/report` | Sold, checked in, no-shows, revenue net of reversals | moved from `GET /events/:id/report` |
| GET | `/api/admin/events/:id/registrations` | Ticket holders with ticket and payment status | added |
| POST | `/api/admin/checkin` | Body `{ qr_token, event_id? }`. Marks the ticket used, once | moved from `POST /checkin` (was volunteer) |
| GET | `/api/admin/members` | Directory. Filters: `status`, `expiring_within_days`, `q` | moved from `GET /members` |
| GET | `/api/admin/members/:id/verify` | At-event membership check, by student ID or member QR | moved from `GET /members/:id/verify` (was volunteer) |
| POST | `/api/admin/members/:id/cash-payment` | Record cash dues: activates the membership and writes a ledger row | moved from `POST /members/:id/cash-payment` (was treasurer) |
| GET | `/api/admin/products` | All products including inactive | added |
| POST | `/api/admin/products` | Create with variants (`size, price, member_price, stock`) | moved from `POST /products` |
| PATCH | `/api/admin/products/:id` | Edit or hide | moved from `PATCH /products/:id` |
| PATCH | `/api/admin/variants/:id` | Price or stock (stock can't drop below `reserved`) | moved from `PATCH /variants/:id` |
| GET | `/api/admin/orders` | Orders table, see below | added |
| GET | `/api/admin/orders/stream` | Server-Sent Events, see below | added |
| PATCH | `/api/admin/orders/:id` | Body `{ status }`, see below | added (replaces `PATCH /orders/:id/fulfil`) |
| POST | `/api/admin/announcements` | Publish to the site and the mailing list | moved from `POST /announcements` |
| GET | `/api/admin/finance/ledger` | Full ledger. `from`, `to`, `category`, `limit`, `offset`; `format=csv` exports everything | moved from `GET /finance/ledger` (was treasurer) |
| POST | `/api/admin/finance/ledger/:id/reverse` | Reversing entry, once per entry | moved from `POST /finance/ledger/:id/reverse` (was treasurer) |
| POST | `/api/admin/expenses` | Submit an expense, optional receipt as base64 | moved from `POST /expenses` (was volunteer) |
| GET | `/api/admin/expenses` | Review queue. `status`, `flagged`, `mine` | moved from `GET /expenses` |
| GET | `/api/admin/expenses/:id` | One expense | moved from `GET /expenses/:id` |
| PATCH | `/api/admin/expenses/:id/review` | Approve or reject. **Not your own**: another admin reviews | moved from `PATCH /expenses/:id/review` (was treasurer) |
| PATCH | `/api/admin/expenses/:id/pay` | Mark paid, writing a ledger `out` row | moved from `PATCH /expenses/:id/pay` (was treasurer) |
| POST | `/api/admin/fundraisers` | Create | moved from `POST /fundraisers` |
| PATCH | `/api/admin/fundraisers/:id` | Edit | moved from `PATCH /fundraisers/:id` |
| GET | `/api/admin/fundraisers/:id/tasks` | Task board with `overdue` | moved from `GET /fundraisers/:id/tasks` (was volunteer) |
| POST | `/api/admin/fundraisers/:id/tasks` | Add a task | moved from `POST /fundraisers/:id/tasks` |
| POST | `/api/admin/fundraisers/:id/cash-income` | Record cash income to the ledger | moved from `POST /fundraisers/:id/cash-income` (was treasurer) |
| PATCH | `/api/admin/tasks/:id` | Assign, change status, set due date | moved from `PATCH /tasks/:id` |

#### `GET /api/admin/orders`

Query parameters:
- `status`: `pending`, `paid`, `fulfilled` or `cancelled`;
- `q`: matches the customer's name or email;
- `page`, from 1;
- `page_size`, at most 100, default 25.

The response is `{ rows, total, page, page_size }`. Each row looks like this:

```json
{ "id": 7, "created_at": "…", "customer": { "id": 2, "name": "…", "email": "…", "is_member": true },
  "items": [{ "product": "T-shirt", "size": "M", "qty": 1, "unit_price": 449 }],
  "total": 449, "payment_status": "paid", "status": "paid" }
```

#### `PATCH /api/admin/orders/:id`

Allowed transitions are `pending → paid → fulfilled`, and any state except `cancelled` → `cancelled`. Anything else is 409 `INVALID_TRANSITION`.
- **`pending → paid`:** the admin is recording cash. The payment settles through the same path as the webhook, with the admin as the ledger author.
- **Cancelling a pending order:** releases the reserved stock.
- **Cancelling a paid or fulfilled order:** restocks, writes a reversing ledger entry and marks the payment refunded. The money goes back through Razorpay or in cash.

The response is the updated admin row.

#### `GET /api/admin/orders/stream`

A Server-Sent Events stream for the admin dashboard.
- **Auth:** `EventSource` can't send headers, so pass the admin JWT as `?token=`. It's verified exactly like a Bearer token: a user token gets 403, a bad one 401. Query strings are never written to the request log.
- **Events:** `event: order` with the admin row as `data`, whenever an order is created, paid, fulfilled, cancelled or expires.
- **Heartbeat:** a `: ping` comment every 25 s; `retry: 5000`.
- **Limit:** the event bus is in-process, which works because the service runs as a single Railway instance (`numReplicas: 1`). More replicas would need Redis pub/sub or similar.

## Environment (new in Phase 1)

| Variable | Default | Purpose |
|---|---|---|
| `DEMO_PAYMENTS` | `false` | `true` enables `POST /api/payments/demo-confirm/:id` and sets `checkout.demo`. Ignored while `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set. Never enable it on a site that takes real money. |
| `ALLOW_DEMO_SEED` | `false` | `npm start` runs the demo seed on boot when `true`. In production the seed refuses to run without it. |
| `SEED_FORCE` | `false` | The seed wipes every table. With `ALLOW_DEMO_SEED=true` in production it skips a non-empty database unless `SEED_FORCE=true`. Set it for one boot, then remove it. |

`SEED_DEMO` is retired; `ALLOW_DEMO_SEED` replaces it.

## Database changes (migration `20261012000000_two_roles`)

- `users.role` changes to `ENUM('admin','user') NOT NULL DEFAULT 'user'`. On SQLite (dev and tests) it's enforced with a CHECK constraint.
  - Existing roles map `admin`, `treasurer` → `admin` and `volunteer`, `member` → `user`.
  - `down()` maps `admin` → `admin` and `user` → `member`.
- `tickets` gets `UNIQUE(event_id, holder_user_id)`.
  - Existing duplicates are kept, not deleted. The best row (checked in, then confirmed, then pending, then newest) stays on the account.
  - The others are detached (`holder_user_id = NULL`) but keep their holder name, email and QR, so they still scan at the door.
- No tables or rows are dropped. `events.non_member_price` stays as a legacy column, default 0.
