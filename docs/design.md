# SSA Portal — design direction

Inspired by the Sui brand/website case study (Behance, Holographik). We borrow its visual discipline, not its product category: no crypto copy, no reused marks or assets.

## What the reference actually does
- One canvas: near-black. One accent: electric blue. White text, a greyscale ramp. Nothing else.
- Decoration is light, not shape: soft radial blue "horizon" glows, vertical striped gradient bars, stair-step pixel histograms, dot-matrix texture.
- Type: a light grotesque at large display sizes with tight tracking; tiny monospace uppercase metadata labels pinned to layout corners.
- Layout: strict grid, generous dark space, thin 1px borders, big-number stat tiles (label top-left, number large).
- Buttons: compact blue pills; outline variant on dark.
- Charts: blue gradient bars.

## Our translation (dark-first, single mode)
- **Theme:** "Signal" — custom tokens in `frontend/src/index.css`. Background #070a12, surface #0d1220, accent #4d8dff (passes 4.5:1 on background as text; #1f6fff fill with white text passes for buttons).
- **Fonts:** Instrument Sans (display + body), JetBrains Mono (labels, metrics, codes). Two families, swap display.
- **Hero archetype:** the dashboard feature card carries the horizon glow; everything else is quiet.
- **Nav:** liquid-glass sidebar on desktop (translucent, blur, 1px border, specular top edge); glass bottom bar on mobile with a "More" sheet.
- **Rhythm:** page header → metric row → two-column modules. 24px gutters, 16px on phones.
- **Cards:** `surface` fill, 1px `border`, 16px radius. Only `FeatureCard` gets gradient light. Status is never colour-only (icon + text).
- **Motion level:** functional. 120/200/320ms, ease-out in, ease-in out; reduced-motion collapses all to 0.
- **Decoration budget:** one glow per view, striped bars only in the brand lockup and empty states.

## Alternatives considered
1. Light-first "Paper" variant of the same tokens (white canvas, same blue) — easy to switch by inverting the neutral ramp.
2. Dual mode with a toggle — deferred; doubles verification surface.

## Public landing page ("/") — Crimson Horizon

The landing page has its own strict palette and type, scoped by the `.landing` class; the app shell and dashboards keep the Midnight/Electric-blue tokens above.

- Colours (Tailwind `@theme` in `frontend/src/index.css`, also `:root` vars): `midnight` #0B0B0D, `crimson` #C1121F, `ivory` #F5F1ED, `ash` #777780. Nothing else except alpha versions.
- Contrast on midnight: ivory 17.6:1; ash 4.3:1, so ash is for hairlines, prices and large text, and small secondary text uses `ivory/65`; crimson 3.2:1, so it is for fills, focus rings and large or script text only. Ivory on crimson is 5.5:1.
- Type: Pinyon Script for accent words of four or fewer words; Manrope for everything else, with `tracking-[0.2em]` on uppercase labels. Section headings pair a script word with an uppercase sans word.
- Motion: framer-motion and Lenis; `MotionConfig reducedMotion="user"` plus CSS fallbacks turn off parallax, marquee, grain, glow drift and cursor follow under reduced motion.
- Content and media: `frontend/src/data/landing.ts`, files under `frontend/public/media/`.
