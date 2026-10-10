# Skyline Student Association — Student Organization System

One platform for memberships, event ticketing, announcements, merchandise, fundraisers/volunteer tasks and club finances.
Modular monolith: React SPA → Express REST API → MySQL (SQLite locally). See [docs/architecture.md](docs/architecture.md).

## Run locally

```bash
cd backend && cp .env.example .env && npm install && npm run migrate && npm run seed && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. With `DATABASE_URL` empty the backend uses `backend/dev.sqlite`.

Demo logins (password `password123`): `admin@ssa.test`, `treasurer@ssa.test`, `volunteer@ssa.test`, `member1@ssa.test`.

## Tests

```bash
cd backend && npm test
```

Covers role separation, cash dues → ledger, capacity under load, webhook HMAC + idempotency, double check-in rejection, event report, expense review/pay, anomaly flags, CSV export + reversals, stock reservation, fundraiser progress, announcement audience, AI secretary proposals.

## Deploy (Railway)

One Node service + MySQL plugin. Root directory = repo root. `railway.json` sets build/start; set `DATABASE_URL` (reference the MySQL plugin), `JWT_SECRET`, `QR_SECRET`, `PAYMENT_WEBHOOK_SECRET`, and optionally `RAZORPAY_KEY_ID/SECRET`, `RESEND_API_KEY`, `CLOUDINARY_URL`, `LLM_API_KEY`. Keep replicas at 1 (in-process cron jobs). Razorpay webhook URL: `https://<domain>/api/webhooks/payment`.

## Layout

```
backend/   Express + TypeScript + Knex (modules: auth, memberships, events, announcements, merchandise, fundraisers, finance, payments, ai; jobs; lib)
frontend/  Vite + React + TanStack Query + Tailwind (pages: public, member, volunteer, admin, treasurer)
database/  migrations + seeds
docs/      architecture.md
```
