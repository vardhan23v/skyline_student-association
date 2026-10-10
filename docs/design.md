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
