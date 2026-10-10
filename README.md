# Skyline Student Association — Website

The public website and app frontend for the Skyline Student Association (SSA), a student club. The landing page covers upcoming events, past events, merch, the club story, a photo gallery and a join form.

> **Status: frontend only.** The previous Express + MySQL backend was removed so it can be rebuilt from scratch. The landing page is fully static and works on its own. The app pages (login, register, dashboards, shop checkout, event details, tickets, volunteer and treasurer tools) still call `/api/...` and show their error states until a new backend exists. The old backend is recoverable from git history, at commit `b2a07a4` and earlier.

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

All copy, prices, dates and photo paths live in `frontend/src/data/landing.ts`. To replace a photo, overwrite the file with the same name; sources and sizes are listed in `frontend/public/media/README.md`.

## Design

- **Colours:** cream `#F6E9CE` for all text and fills, flame red `#FF6B5E` for the script accent words, midnight `#0B0B0D` base.
- **Type:** Open Sauce Sans, self-hosted, for everything (uppercase for headings and UI, sentence case for reading text). Pinyon Script stands in for Rumble Brave as the lowercase accent script; see `frontend/src/styles/fonts.css` to switch.
- **Backgrounds:** one photographic background per section, crossfading as you scroll, with a vignette, a heat glow and rising embers. Config is in `frontend/src/data/backgrounds.ts`, sources in `frontend/design/backgrounds-source/`, and they're rebuilt with `npm --prefix frontend run bg:prepare`.
- **Motion:** framer-motion and Lenis smooth scroll, plus a custom "student" cursor on desktop. Everything respects `prefers-reduced-motion`.
- **Logo:** `frontend/public/brand/` (original in `frontend/design/logo-source.png`).

Details and rationale: [`docs/design.md`](docs/design.md).

## Tech

React 18 · Vite 5 · TypeScript · Tailwind CSS v4 · TanStack Query · React Router 6 · framer-motion · Lenis · vite-imagetools (responsive AVIF/WebP/JPEG at build time). Production is served by `serve.mjs`, a dependency-free static server with single-page-app fallback.

## Run locally

```bash
npm --prefix frontend install
npm run dev                      # http://localhost:5173
```

Production build and local preview:

```bash
npm run build
npm start                        # http://localhost:8080
```

## Deploy (Railway)

The web service builds with `npm run build` and starts with `npm start`. The health check is `/health`, and Railway injects `PORT`. No environment variables are needed while there's no backend.

```bash
railway up --service web
```

The Railway project still has a MySQL service holding the old backend's data. It's unused now; keep it for the rebuild or delete it in the Railway dashboard.

## Rebuilding the backend

[`docs/architecture.md`](docs/architecture.md) is the original product specification: roles, money rules, ticketing, check-in and the data model. Use it as the brief for the new backend.

The frontend expects:

- a REST API at the same origin under `/api` (the client is in `frontend/src/api/client.ts`);
- bearer-token auth;
- the response shapes in `frontend/src/api/types.ts`.

In development, Vite proxies `/api` to `http://localhost:3000` (see `frontend/vite.config.ts`).
