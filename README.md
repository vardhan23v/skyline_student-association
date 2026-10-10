# Skyline Student Association — Club Management Website

A single website where a student club runs everything it does: members, events and tickets, announcements, merchandise, fundraisers, and club money.

## Who uses it

| User | What they do on the site |
|---|---|
| **Student / Member** | Sign up, pay membership dues, buy event tickets, order club merch, read announcements, see where club money goes |
| **Volunteer** | Scan tickets at the door, verify members, pick up fundraiser tasks, submit expense receipts |
| **Admin (club leads)** | Create events, post announcements, manage members, products and fundraisers |
| **Treasurer** | Approve reimbursements, record cash, see the full ledger and reports |

## How it works

1. **Join** — A student registers, pays dues online (Razorpay) or in cash at the club table. Their membership gets an expiry date; the site emails a reminder before it runs out.
2. **Events** — Admin publishes an event with member / non-member prices and a seat limit. Students buy tickets online and receive a QR ticket by email. At the door a volunteer scans the QR with their phone; the ticket is marked used instantly, so no one can reuse it and no paper list is needed. After the event the admin sees attendance and revenue.
3. **Announcements** — Admin writes one post; it appears on the website and goes out to the mailing list at the same time. Old posts stay in an archive.
4. **Merchandise** — Admin lists products with sizes and stock. Members order and pay online; stock updates automatically and the admin marks orders as handed over.
5. **Fundraisers** — Admin creates a fundraiser with a target; tasks are assigned to volunteers with deadlines, and progress is tracked on a board.
6. **Money** — Every payment (dues, tickets, merch, fundraiser cash) and every approved reimbursement is written to one ledger automatically. Volunteers upload receipts for expenses; the treasurer approves and pays them. The balance and reports are generated from the ledger, and every member can view the summary — that is the transparency.
7. **AI Secretary** — Any user can ask questions in plain English ("which members haven't renewed?", "how much did we spend this month?"). Answers come from the database, and any action (like sending a reminder) needs a confirm click.
8. **Anomaly flags** — Expenses that look unusual (too large, duplicate receipt, over budget, no receipt) are flagged for the treasurer to review.

## Tech

React (Vite + Tailwind) frontend · Node/Express API · MySQL · JWT login with roles · Razorpay payments · Resend email · Cloudinary for receipts · deployed on Railway as one service.

## Run locally

```bash
npm --prefix backend install && npm --prefix frontend install
cp backend/.env.example backend/.env      # fill in DB, JWT, Razorpay, email keys
npm --prefix backend run migrate && npm --prefix backend run seed
npm --prefix backend run dev              # API  → http://localhost:3000/api
npm --prefix frontend run dev             # Site → http://localhost:5173
```

## Design

Dark-first "Signal" visual system: tokens in `frontend/src/index.css`, primitives in `frontend/src/components/` (AppShell, LiquidGlassNav, PageHeader, MetricCard, FeatureCard, StatusBadge, DataTable, EmptyState, EventCard, TaskCard, TransactionRow, Button, Input, Modal, Toast). Direction and rationale: [`docs/design.md`](docs/design.md).

Full architecture: [`docs/architecture.md`](docs/architecture.md)

## Deploy on Railway

One Railway project, two services: **MySQL** (Railway template) and this repo as a **web service**. The repo's `railway.json` already sets the build (`npm run build`), start (`npm start`) and health check (`/api/health`). Start runs migrations, optionally seeds, then serves the API and the built frontend from one port.

1. New project → **Deploy from GitHub repo** → pick this repo, root directory `/`.
2. In the same project, **+ New → Database → MySQL**.
3. On the web service → **Variables**, add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` (reference, resolves to the private URL) |
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | random, 32+ chars |
   | `QR_SECRET` | random, 16+ chars |
   | `SEED_DEMO` | `true` for the first deploy only, then remove it |
   | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `PAYMENT_WEBHOOK_SECRET` | from Razorpay, when ready |
   | `RESEND_API_KEY`, `CLOUDINARY_URL` | optional |

   Do not set `PORT`; Railway injects it.
4. **Settings → Networking → Generate Domain**. Open `https://<domain>/api/health`, then `/`.
5. Demo logins after seeding: `admin@ssa.test`, `treasurer@ssa.test`, `volunteer@ssa.test`, `member1@ssa.test`, password `password123`. Change or delete them before real use.
