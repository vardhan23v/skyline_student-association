# Skyline Student Association — Website

The website and club app for the Skyline Student Association (SSA), a student club. Live at **https://skyline-student-association.up.railway.app**.
- **Landing page:** upcoming events, past events, merch, the club story, a photo gallery and a join form.
- **Behind it:** a Node/Express + MySQL API for memberships, event registration, merch orders, announcements and the club's finances.

> **Status: all four phases are done.**
> - **Phase 1:** the API, with two roles, members-only registration, and orders with a live admin feed. See [`docs/api.md`](docs/api.md).
> - **Phase 2:** the frontend runs on that API, with standalone auth, role-based landing, the membership gate and the tabbed admin dashboard.
> - **Phase 3:** one UI. Every page uses the landing page's palette, type, glass surfaces, motion and cursor. See [`docs/design.md`](docs/design.md); before/after screenshots are in [`docs/screenshots/`](docs/screenshots/).
> - **Phase 4:** mobile. Every page works from 320px phones to desktop: a hamburger sheet, a sticky admin tab strip, card-mode tables, bottom sheets, sticky action bars and touch-first landing sections. Checked by Playwright at four viewports (below); see the Responsive section of [`docs/design.md`](docs/design.md).

## Roles

| Role | Can do |
|---|---|
| **Admin** | Runs everything: events, registrations and check-in, members and cash dues, merch and stock, orders, announcements, the ledger and expenses, fundraisers |
| **User** | Any registered student: browse, buy a membership, register for events **while a member**, order merch, see their own membership, tickets and orders |

Membership is a status, not a role. A non-member who tries to register for an event gets `403 MEMBERSHIP_REQUIRED`, with the price and benefits for the membership card; once they pay, they can register.

## Demo logins

Created by the demo seed (`database/seeds/001_demo.ts`).

| Role | Email | Password | State |
|---|---|---|---|
| Admin | `admin@skyline.edu` | `Admin@123` | Full control |
| User (member) | `member@skyline.edu` | `Member@123` | Active membership until the end of the academic year (30 June); registered for CodeStorm 2026 and the Spring Gala; three orders (fulfilled, paid, pending) |
| User (non-member) | `student@skyline.edu` | `Student@123` | No membership; has a student ID, so they can buy one |

The seed also adds:
- four upcoming events (CodeStorm 2026, Tech Trivia, Rhythm Unplugged, Spring Gala), with 1 of 2 Spring Gala seats left;
- one past event;
- the four merch products, with sizes, prices, member prices and stock.

**These passwords are public. Change them, or delete the accounts, before real use.** The seed wipes the database, and in production it refuses to run unless `ALLOW_DEMO_SEED=true`.

## What's on the landing page

| Section | Content | Where it comes from |
|---|---|---|
| Hero | *skyline* STUDENT ASSOCIATION, tagline, two calls to action | `frontend/src/data/landing.ts` |
| Upcoming events | CodeStorm 2026, Tech Trivia, Rhythm Unplugged, Lenscape, InnovateX: date, category, description, venue, duration, team size | `landing.ts` (typographic cards, no photos until the events happen) |
| Past events | Six events with photo, date, hall and description | `landing.ts` + `frontend/public/media/past/` |
| Merch | T-shirt ₹499, Bag ₹299, Water bottle ₹399, Stickers ₹99, with a cursor-follow preview | `landing.ts` + `frontend/public/media/merch/` |
| About | What the club does, three feature tiles, stat counters | `landing.ts` |
| Gallery | Twelve event photos in a two-row marquee with a lightbox | `landing.ts` + `frontend/public/media/gallery/` |
| Join | Name, email and student ID, handed to `/register` | `JoinCTA.tsx` |

The landing page is static. The event and merch data behind the app pages come from the API.

All copy, prices, dates and photo paths live in `frontend/src/data/landing.ts`. To replace a photo, overwrite the file with the same name; sources and sizes are listed in `frontend/public/media/README.md`.

## Design

- **One UI everywhere:** the landing page, login, `/me`, the shop and the admin dashboard share one set of tokens (`frontend/src/index.css`, mirrored in `lib/palette.ts`).
- **Colours:**
  - midnight `#0B0B0D` base;
  - cream `#F6E9CE` for all text;
  - crimson `#C1121F` for fills, focus rings and active states, never text;
  - flame `#FF6B5E` for red text and the script accents;
  - toned green, amber and red for status only.
- **Type:** Open Sauce Sans, self-hosted, for everything: uppercase for headings and UI, sentence case for reading text. Every page header pairs a lowercase script word with an uppercase title (*your* ACCOUNT). Pinyon Script stands in for Rumble Brave; see `frontend/src/styles/fonts.css` to switch.
- **Backgrounds:** one photographic background per section, crossfading as you scroll, with a vignette, a heat glow and rising embers. Config is in `frontend/src/data/backgrounds.ts`, sources in `frontend/design/backgrounds-source/`, and they're rebuilt with `npm --prefix frontend run bg:prepare`.
- **Motion:** framer-motion and Lenis smooth scroll, plus a custom "student" cursor on desktop. Everything respects `prefers-reduced-motion`.
- **Logo:** `frontend/public/brand/` (original in `frontend/design/logo-source.png`).

Details and rationale: [`docs/design.md`](docs/design.md).

## Tech

**Frontend:** React 18 · Vite 5 · TypeScript · Tailwind CSS v4 · TanStack Query · React Router 6 · framer-motion · Lenis · vite-imagetools (responsive AVIF/WebP/JPEG at build time).

**Backend:** Node 22 · Express · TypeScript · Knex · MySQL (SQLite locally and in tests) · JWT + bcrypt · Razorpay, or demo payments · Resend email · vitest + supertest.

In production, Express serves the API and the built frontend from one origin.

## Run locally

```bash
npm --prefix backend install && npm --prefix frontend install
cp backend/.env.example backend/.env     # leave DATABASE_URL empty to use SQLite at backend/dev.sqlite
npm --prefix backend run migrate && npm --prefix backend run seed
npm run dev:backend                      # API  → http://localhost:3000/api
npm run dev:frontend                     # Site → http://localhost:5173 (proxies /api)
```

Set `DEMO_PAYMENTS=true` in `backend/.env` to complete payments without Razorpay.

Tests use an in-memory database:

```bash
npm test
```

Responsive checks (Playwright, using your installed Chrome): with the demo app running on port 8099
(`npm run build`, then `DEMO_PAYMENTS=true ALLOW_DEMO_SEED=true PORT=8099 npm start`), run
`npm --prefix frontend run test:responsive`. It loads every key page at 360, 390, 768 and 1280px wide, fails on any
horizontal scroll or a key control under 44px, and writes full-page screenshots to `frontend/tests/screenshots/`
(git-ignored). `npm --prefix frontend run media:prepare` rebuilds the 480px phone copies of the landing photos.

## Deploy (Railway)

One project with two services: **MySQL** and **web** (this repo).
- `railway.json` sets the build (`npm run build`) and start (`npm start`), with a health check at `/health`.
- Start runs the migrations, then the demo seed if enabled, then serves the API and the frontend.

```bash
railway up --service web
```

Web service variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://skyline-student-association.up.railway.app`: the public origin, no trailing slash. **Required**: the app won't start without it. Email links are built from it, and any other hostname gets a 301 to it |
| `VITE_APP_URL` | Same value. Read at build time for the canonical and Open Graph URLs in `index.html` |
| `JWT_SECRET` / `QR_SECRET` | Random, 32+ and 16+ characters, and different from each other. The app refuses to start without them |
| `DEMO_PAYMENTS` | `true` to take demo payments while no Razorpay keys are set. Leave it unset once real payments are on |
| `ALLOW_DEMO_SEED` | `true` to seed the demo data on boot |
| `SEED_FORCE` | `true` for **one** boot to wipe an existing database and reseed it, then remove it |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `PAYMENT_WEBHOOK_SECRET` | From Razorpay, when ready |
| `APP_TIMEZONE` | Optional, default `Asia/Kolkata` |
| `RESEND_API_KEY`, `CLOUDINARY_URL` | Optional |

Railway injects `PORT`; don't set it. Keep `numReplicas` at 1: the cron jobs and the live orders feed run in-process.

## API

[`docs/api.md`](docs/api.md) lists every route, with its role, purpose and how it changed in Phase 1. It also covers the error codes, the checkout flow and the database migration. [`docs/architecture.md`](docs/architecture.md) is the original product specification; its four-role model is superseded by the two roles above.
