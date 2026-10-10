# SSA — design system

One UI for every page: the landing page, login and register, the account and ticket pages, events, shop and the
admin dashboard all share the same colours, type, glass surfaces and motion. Tokens live in
`frontend/src/index.css` (`:root` and the landing `@theme` block), mirrored for JS in `frontend/src/lib/palette.ts`.

## Colour
| Role | Value | Use |
|---|---|---|
| Midnight | `#0B0B0D` | Page background, button text on cream |
| Cream | `#F6E9CE` | All text; 70% secondary, 60% tertiary/labels, 22% strong hairlines, 10–12% hairlines |
| Crimson | `#C1121F` | Fills, focus rings, selection, active-tab bar, danger buttons. **Never text** (3.2:1) |
| Flame | `#FF6B5E` | Red text: script accent words, accent links and icons (7.0:1) |
| Success / warning / danger | `#8FD0A4` / `#E8B86A` / `#FF7A70` | Status only, always with an icon and text |

Contrast on midnight (worst case over the dimmed photo backgrounds in brackets): cream 16.4:1 (14.4), cream/70 8.2
(7.6), cream/60 6.2 (5.9), flame 7.0 (6.2), green 11.0, amber 10.8, danger 7.7. Cream on crimson is 5.2:1 and
midnight on cream 16.4:1, so both button fills pass. No other hues anywhere.

Primary buttons are cream (as on the landing page). To make them crimson everywhere, set `--btn-primary-bg` to
`var(--accent)` and `--btn-primary-fg` to `var(--accent-foreground)` in `:root`: one change, and it still passes AA.

## Type
- **Open Sauce Sans** (self-hosted, OFL) for everything. Headings, nav, buttons, labels and table headers are
  uppercase with 0.14–0.18em tracking; reading text, table cells and form inputs are sentence case (`--case-*`).
- **Script accent**: `--font-script`, Rumble Brave once its file is added (see `src/styles/fonts.css`), Pinyon Script
  until then. Always lowercase, one word per page header, in flame.
- Every page header is the landing `SectionHeading` (`PageHeader` renders it): *welcome* BACK, *your* ACCOUNT,
  *control* ROOM, *club* ORDERS, *what's* ON…

## Surfaces
- **Glass recipe** (the landing navbar): midnight at 45–55%, a cream 10% hairline, `rounded-2xl`.
  - Fixed and floating layers (navbar, admin sidebar, modals, drawers, menus, toasts) add `backdrop-blur-xl`.
  - Cards and tables don't: they scroll over a fixed photo, and backdrop-filter there re-blurs every frame (the old
    landing events→past jank). The photo behind them is already dimmed, so the frost wouldn't show.
- **Backgrounds** come from `BackgroundStage`:
  - `stage`: the landing's scroll-linked crossfade.
  - `still`: the hero photo with scrim, heat glow, vignette and embers, on login, register, `/me` and the public app pages.
  - `dim`: the hero photo blurred under an 80% midnight overlay, with no embers, on `/admin`.
- **Buttons**: the landing classes. `btn-l-primary` (cream solid), `btn-l-secondary` (cream outline, fills on hover),
  plus `btn-danger` (crimson) and `btn-ghost`. `Button.tsx` maps its variants onto them.
- **Fields**: transparent glass, cream 22% border, crimson focus ring; uppercase small labels.
- **Tables** (`DataTable`): uppercase cream/60 headers, cream 8% dividers, cream 4% row hover; cards under 768px (see Responsive).

## Motion and cursor
- Page and admin-tab enter: fade + 12px rise, 0.4s, `ease.out` (`[0.22, 1, 0.36, 1]`); section headings rise as
  they enter the viewport. `MotionConfig reducedMotion="user"` and CSS fallbacks turn motion off when asked.
- The student cursor runs on every page. It hides over text fields and over the check-in camera
  (`data-cursor="text"`), where the normal pointer returns.

## Responsive (Phase 4)
Mobile first: base styles target 360px; `sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280 add layout. Nothing scrolls
sideways at 320px (WCAG reflow). Checked by `frontend/tests/responsive.spec.ts` at 360, 390, 768 and 1280.
- **Rhythm**: 16px gutter on phones, 24px from md, 32px from lg (`.l-gutter`); landing sections pad 80 / 104 / 128px
  (`.l-section`). Display type is fluid (`.t-display` `clamp(2.25rem, 11.5vw, 7.5rem)`, sized so ASSOCIATION fits 360px);
  script words are 1.4× their uppercase pair. Reading text and every input are ≥16px (no iOS zoom on focus).
- **Touch**: every control is ≥44×44px with ≥8px between neighbours. Custom `:hover` rules sit in
  `@media (hover: hover)`; the cursor-follow merch preview, the student cursor and the carousel arrows are for a fine
  pointer only. Fixed and sticky layers pad with `env(safe-area-inset-*)`; full-height sections use `svh`.
- **Navigation**: app pages link Events, Shop and News (Finance is admin-only, inside the dashboard). Below md the navbar is logo + hamburger; the sheet is full screen, traps focus, locks scroll and
  closes on a link, ✕, Esc or Back. Below lg the admin sidebar becomes a sticky, snap-scrolling tab strip under the
  navbar (faded edges, active tab centred).
- **Tables** (`DataTable`): under md each row is a card. Columns choose a `mobile` slot: `primary` (title), `status`
  (top right), `secondary` (label/value rows, the default) or `actions` (full-width at the bottom); `hideOnMobile`
  drops one. From md it's a table that scrolls inside its card with the first column pinned when it can't fit.
- **Sheets**: under 640px every `Modal` is a bottom sheet (90svh, drag handle, swipe down to close, actions stacked
  full width with the primary last). Toasts sit at the top on phones so they never cover a bottom bar.
- **Sticky bars**: event Register, shop cart, check-in "Scan next", announcement Publish.
- **Motion**: under md backgrounds crossfade on opacity only (no blur, scale or parallax) and only neighbouring
  backgrounds stay loaded; section reveals are a 300ms fade + 12px rise; Lenis is off on touch screens.

## Content and media
- Landing copy, prices and photo paths: `frontend/src/data/landing.ts`; files under `frontend/public/media/`, each past/gallery
  photo with a `-480.jpg` phone copy (`npm --prefix frontend run media:prepare`).
- Backgrounds: masters in `src/assets/backgrounds/`, originals in `design/backgrounds-source/`, rebuilt with
  `npm run bg:prepare`. Each section's `overlay` keeps cream/70 text at AA over the brightest part of its image.
