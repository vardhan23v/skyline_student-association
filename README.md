<div align="center">

<img src="frontend/public/brand/logo-192.png" alt="Skyline Student Association logo" width="112" height="112" />

# Skyline Student Association

**Many students, one horizon.** The club's website and operations platform: events and members-only ticketing, memberships, merch, announcements, door check-in and the club's books, in one mobile-first app.

<br />

[![Live demo](https://img.shields.io/badge/LIVE-skyline--student--association.up.railway.app-C1121F?style=for-the-badge&logo=railway&logoColor=F6E9CE&labelColor=0B0B0D)](https://skyline-student-association.up.railway.app)
[![Deployed on Railway](https://img.shields.io/badge/DEPLOYED_ON-RAILWAY-0B0B0D?style=for-the-badge&logo=railway&logoColor=white)](https://railway.com)
[![Status](https://img.shields.io/badge/STATUS-ALL_4_PHASES_SHIPPED-8FD0A4?style=for-the-badge&labelColor=0B0B0D)](#roadmap)

[![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite_5-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)](https://www.framer.com/motion/)

[![Node.js](https://img.shields.io/badge/Node_22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com)
[![Razorpay](https://img.shields.io/badge/Razorpay-0C2451?style=for-the-badge&logo=razorpay&logoColor=white)](https://razorpay.com)

[![API tests](https://img.shields.io/badge/API_TESTS-97_PASSING-8FD0A4?style=for-the-badge&logo=vitest&logoColor=white&labelColor=0B0B0D)](#testing)
[![Playwright](https://img.shields.io/badge/PLAYWRIGHT-44%2F44_VIEWPORT_CHECKS-2EAD33?style=for-the-badge&logo=playwright&logoColor=white&labelColor=0B0B0D)](#testing)
[![Mobile first](https://img.shields.io/badge/MOBILE_FIRST-320px_→_DESKTOP-F6E9CE?style=for-the-badge&labelColor=0B0B0D)](docs/design.md#responsive-phase-4)
[![Accessibility](https://img.shields.io/badge/LIGHTHOUSE_A11Y-100-F6E9CE?style=for-the-badge&logo=lighthouse&logoColor=white&labelColor=0B0B0D)](#quality)

<br />

[**Live site**](https://skyline-student-association.up.railway.app) · [Architecture](#architecture) · [Getting started](#getting-started) · [Deployment](#deployment) · [API reference](docs/api.md) · [Design system](docs/design.md)

</div>

---

## Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Design system](#design-system)
- [Quality](#quality)
- [Roadmap](#roadmap)
- [Documentation](#documentation)

## Overview

SSA runs on a single deployable unit: an **Express** service that serves both the **React** single-page app and a REST **API** from one origin (no CORS, one domain, one deploy), backed by **MySQL**. There are two roles, `admin` and `user`; **membership is a status, not a role**, and it gates event registration. Payments settle through one server-side path whether they come from Razorpay's webhook, the demo checkout or an admin recording cash.

## Features

| For students and members | For admins |
|---|---|
| Landing page: upcoming and past events, merch, the club story, gallery, join form | Tabbed dashboard at `/admin`: overview, events, check-in, members, orders, products, announcements, finance |
| Standalone login and register, with role-based landing (`/me` or `/admin`) | **Live orders** over Server-Sent Events, with a polling fallback |
| Buy a membership in one bottom sheet (Razorpay or demo pay); **renew online** from 30 days before expiry | Door **check-in scanner**: rear camera, ✓/✗ banner with vibration, live attendance count, and a **Membership** mode that verifies member QRs or student IDs |
| Members-only **event registration** with QR tickets (wake lock on the ticket screen) | Members directory with **dues status** (paid online/cash, unpaid), dues history, **cash dues** that add or extend a membership, **set expiry date** and **send renewal reminder** |
| **Merch shop** with live stock, size chips, member pricing and a cart sheet | Products and stock per size; events with capacity, pricing and reports |
| Account page: membership status, days left, benefits, **dues history**, a renewal banner, membership QR, tickets and order status | **Finance (admin-only):** summary, append-only ledger with CSV export and reversals, expense review |
| Fully usable on phones from 320 px | AI Secretary that answers from live data; actions need explicit confirmation |

## Architecture

<p align="center">
  <img src="docs/architecture.svg" alt="Architecture: browsers reach one Railway web service (Express serving the React SPA and the /api) backed by Railway MySQL, with Razorpay, Resend, Cloudinary and Anthropic as external services" width="100%" />
</p>

**Key decisions**

- **One origin.** Express serves `frontend/dist` and `/api/*`; the SPA calls `/api` relative, so no CORS and no API URL to configure.
- **Two roles, membership as a status.** Admin routes live under `/api/admin/*` behind a single `requireRole('admin')`. A non-member who tries to register gets `403 MEMBERSHIP_REQUIRED` with the offer, and the UI resumes the registration after they pay.
- **One payment path.** `settlePayment()` is shared by the Razorpay webhook, `POST /payments/demo-confirm/:id` and admin cash, so tickets, orders and memberships confirm the same way. Seats and stock are held for 15 minutes.
- **Append-only money.** Every rupee is a ledger row; mistakes are fixed with reversing entries, never edits.
- **In-process realtime and jobs.** The orders SSE feed and `node-cron` jobs run in the web process, so the service stays at `numReplicas: 1`. Scaling out would need Redis pub/sub and a job lock.
- **One public hostname.** `APP_URL` builds every absolute link the API writes, and production 301s any other hostname to it (health checks and webhooks excepted).

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS v4, TanStack Query, React Router 6, framer-motion, Lenis, vite-imagetools (AVIF/WebP/JPEG) |
| Backend | Node 22, Express, TypeScript, Knex, zod, JWT + bcrypt, helmet, express-rate-limit, pino, node-cron |
| Data | MySQL on Railway; SQLite for local development and tests |
| Integrations | Razorpay (payments), Resend (email), Cloudinary (receipts), Anthropic (AI Secretary) |
| Testing | vitest + supertest (API), Playwright (responsive viewport checks) |
| Hosting | Railway: one `web` service and one MySQL service |

## Getting started

**Prerequisites:** Node 22 and npm. Google Chrome for the Playwright checks.

```bash
# 1. Install
npm --prefix backend install && npm --prefix frontend install

# 2. Configure (leave DATABASE_URL empty to use SQLite at backend/dev.sqlite)
cp backend/.env.example backend/.env

# 3. Create the schema and the demo data
npm --prefix backend run migrate && npm --prefix backend run seed

# 4. Run (two terminals)
npm run dev:backend    # API  → http://localhost:3000/api
npm run dev:frontend   # Site → http://localhost:5173 (proxies /api)
```

Set `DEMO_PAYMENTS=true` in `backend/.env` to complete checkouts without Razorpay.

### Demo accounts

Created by the demo seed (`database/seeds/001_demo.ts`):

| Role | Email | Password | State |
|---|---|---|---|
| Admin | `admin@skyline.edu` | `Admin@123` | Full control |
| User (member) | `member@skyline.edu` | `Member@123` | Active until 30 June; registered for CodeStorm 2026 and the Spring Gala; three orders (fulfilled, paid, pending) |
| User (non-member) | `student@skyline.edu` | `Student@123` | No membership yet; has a student ID, so can buy one |

The seed also adds four upcoming events (CodeStorm 2026, Tech Trivia, Rhythm Unplugged and the Spring Gala with 1 of 2 seats left; the live site's Gala has since been raised to 200 seats), one past event and four merch products with sizes and stock.

> [!WARNING]
> These passwords are public. Change them or delete the accounts before real use. The seed **wipes the database**; in production it refuses to run unless `ALLOW_DEMO_SEED=true`, and skips a non-empty database unless `SEED_FORCE=true`.

## Testing

```bash
npm test                                   # API: 97 tests on an in-memory database
```

**Responsive checks** load every key page at **360, 390, 768 and 1280 px**. Each check fails on any horizontal scroll or a key control under 44 px, and writes a full-page screenshot to `frontend/tests/screenshots/` (git-ignored). They use your installed Chrome, so nothing is downloaded:

```bash
npm run build && DEMO_PAYMENTS=true ALLOW_DEMO_SEED=true PORT=8099 npm start   # terminal 1
npm --prefix frontend run test:responsive                                      # terminal 2
```

## Project structure

```text
.
├── backend/
│   ├── src/
│   │   ├── app.ts               # Express app: security headers, /api router, SPA + asset caching
│   │   ├── config/              # env (zod-validated), db, knexfile
│   │   ├── middleware/          # auth (JWT, roles), canonicalHost (301), validation, errors
│   │   ├── modules/             # admin · ai · announcements · auth · events · finance
│   │   │                        # fundraisers · memberships · merchandise · payments
│   │   ├── jobs/                # node-cron: holds, reminders, expiry, low stock
│   │   └── lib/                 # email, QR signing, storage, dates, logging
│   └── test/                    # vitest + supertest suites
├── database/
│   ├── migrations/              # Knex migrations (run on every start)
│   └── seeds/001_demo.ts        # demo data
├── frontend/
│   ├── src/
│   │   ├── pages/               # public · member · admin
│   │   ├── components/          # shared UI (DataTable, Modal, Button…) and landing/
│   │   ├── data/                # landing copy, background config
│   │   └── index.css            # design tokens and component styles
│   ├── public/                  # brand, fonts, media, og-image
│   └── tests/                   # Playwright responsive checks
├── docs/                        # api.md · design.md · architecture.md · architecture.svg
├── package.json                 # root build/start used by Railway
└── railway.json                 # build, start, health check
```

## Configuration

Backend settings come from `backend/.env` locally and from Railway variables in production (see `backend/.env.example`).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | prod | MySQL connection; `${{MySQL.MYSQL_URL}}` on Railway. Empty locally to use SQLite |
| `NODE_ENV` | prod | `production` on Railway |
| `APP_URL` | **prod** | Public origin, no trailing slash, e.g. `https://skyline-student-association.up.railway.app`. Email links are built from it and other hostnames get a 301 to it. **The app won't start without it** |
| `VITE_APP_URL` | build | Same value. Fills the canonical and Open Graph URLs in `index.html` at build time |
| `JWT_SECRET` / `QR_SECRET` | **prod** | Random, 32+ and 16+ characters, different from each other |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `PAYMENT_WEBHOOK_SECRET` | for payments | From the Razorpay dashboard |
| `DEMO_PAYMENTS` | no | `true` allows demo checkout while no Razorpay keys are set. Never on a site taking real money |
| `ALLOW_DEMO_SEED` / `SEED_FORCE` | no | Seed on boot / wipe and reseed a non-empty database for one boot |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | Outgoing email; without a key, emails are logged instead |
| `CLOUDINARY_URL` | no | Receipt storage; without it receipts are stored inline |
| `LLM_API_KEY` | no | AI Secretary model access |
| `APP_TIMEZONE` | no | Club calendar for expiry and jobs; default `Asia/Kolkata` |

Railway injects `PORT`; don't set it.

## Deployment

Railway project with two services, **web** (this repo) and **MySQL**. `railway.json` runs the root `npm run build` and `npm start`: migrations, the demo seed if enabled, then the server. The health check is `/health`.

```bash
railway up --service web
```

Hashed bundles under `/assets/` are cached for a year (`immutable`); `index.html` is `no-cache`, so a deploy is picked up on the next page load. GitHub isn't connected to the Railway project, so pushing doesn't deploy.

### Domain

Live at **`https://skyline-student-association.up.railway.app`** (renamed from the generated `web-production-2ba70` name, which Railway released and now returns *Not Found*). `APP_URL` and `VITE_APP_URL` are set to it. To change the domain again, or add a custom one such as `skylinessa.in`:

1. Railway → `web` → Settings → Networking → Public Networking: edit the domain, or choose **+ Custom Domain** and add the CNAME it shows at the registrar.
2. Point the app at it and redeploy:
   ```bash
   railway variables --service web --set "APP_URL=https://<new-domain>" --set "VITE_APP_URL=https://<new-domain>" --skip-deploys && railway up --service web
   ```
3. Update the Razorpay webhook (`https://<new-domain>/api/webhooks/payment`), Resend's sender domain and `EMAIL_FROM` (custom domain only), Cloudinary referrers (if restricted) and the repo's Website field.

Any hostname other than `APP_URL`'s that still reaches the service gets a 301 to it; `/health`, `/api/health` and `/api/webhooks/*` answer on any hostname.

## Design system

One UI across every page: the landing page, auth, `/me`, the shop and the admin dashboard share a single token set (`frontend/src/index.css`, mirrored in `lib/palette.ts`).

| Token | Value | Use |
|---|---|---|
| Midnight | `#0B0B0D` | Base background |
| Cream | `#F6E9CE` | All text (70% / 60% for secondary and tertiary) |
| Crimson | `#C1121F` | Fills, focus rings, active states. Never used for text |
| Flame | `#FF6B5E` | Red text and the script accent words |

- **Type:** Open Sauce Sans, self-hosted. Headings and UI are uppercase; every page header pairs a lowercase script word with an uppercase title, e.g. *your* ACCOUNT.
- **Surfaces:** glass panels over photographic, crossfading section backgrounds with embers and a heat glow.
- **Motion:** framer-motion and Lenis on desktop. Phones get lighter motion and native scrolling. Everything respects `prefers-reduced-motion`.
- **Mobile:** a hamburger sheet, a sticky admin tab strip, card-mode tables, bottom-sheet dialogs and sticky action bars.

Full rationale, contrast figures and the responsive rules: [`docs/design.md`](docs/design.md).

## Quality

| Area | How it's held |
|---|---|
| Correctness | 97 API tests: roles, membership gate, payments, holds, ledger, domain redirect |
| Responsive | Playwright at 4 viewports; no horizontal scroll down to 320 px (WCAG reflow) |
| Accessibility | 44 px touch targets, AA contrast on every background, focus traps in sheets, announced form errors. Lighthouse accessibility 100 |
| Performance | Admin, scanner and charts are split into separate chunks; public pages load about 160 KB of gzipped JS. Phone image sizes, lazy media, immutable asset caching. CLS 0 |
| Security | helmet, rate limits on auth and purchases, zod validation, signed QR tokens and webhooks, admin-only finance |

## Roadmap

<details>
<summary><b>Phase 1–4: shipped</b></summary>

| Phase | Delivered |
|---|---|
| **1 · API** | Two roles, members-only registration, orders API with a live admin feed, demo seed, test suite. See [`docs/api.md`](docs/api.md) |
| **2 · Frontend** | Standalone auth, role-based landing, the membership gate, the tabbed admin dashboard with live orders |
| **3 · One UI** | The landing page's palette, type, glass, motion and cursor on every page. Before/after shots in [`docs/screenshots/`](docs/screenshots/) |
| **4 · Mobile** | Every page from 320 px to desktop, Playwright viewport checks, `APP_URL` and the domain redirect, Open Graph tags, asset caching |
| **Since** | Finance is admin-only: hidden from members and visitors, `/finance` redirects, and the summary API and AI tool require an admin |

</details>

**Next up**
- [x] Move to `skyline-student-association.up.railway.app`
- [ ] Turn on Razorpay live keys and switch off `DEMO_PAYMENTS`
- [ ] Rotate or remove the public demo accounts
- [ ] Prerender the landing and login shells to bring cold-load LCP under 3 s

## Documentation

| Document | What's in it |
|---|---|
| [`docs/api.md`](docs/api.md) | Every route with its role and purpose, error codes, the checkout flow, environment, migrations and later changes |
| [`docs/design.md`](docs/design.md) | Design tokens, type, surfaces, motion and the responsive system |
| [`docs/architecture.md`](docs/architecture.md) | The original product specification (data model and money rules still apply; its four roles are superseded) |
| [`docs/architecture.svg`](docs/architecture.svg) | The system diagram above |
| [`frontend/public/media/README.md`](frontend/public/media/README.md) | Landing photos and videos: sizes, sources and how to replace them |

<div align="center">
<br />
<sub>Built for the Skyline Student Association · Beyond the Bell.</sub>
</div>
