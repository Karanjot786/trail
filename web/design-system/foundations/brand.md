# Brand

## The mark

A rounded bar over three descending dots: footsteps leaving a trail. Geometry on a 256 grid: bar `x40 y34 w176 h44 rx22`; circles at (128, 122) r22, (128, 170) r18, (128, 212) r14. The radii step down by 4.

**One mark.** Four solid shapes, one colour, `fill="currentColor"`. The landing's faded fourth dot (opacity .6) and the docs' blue fourth dot are retired. Source: `brand/trail-mark.svg`.

| Variant | File | Use |
|---|---|---|
| Mark | `brand/trail-mark.svg` | Header, footer, sidebar, inline. Takes the text colour |
| Favicon | `brand/trail-mark-favicon.svg` | Mark scaled 1.28 to fill the frame; ink on light, near-white on dark via `prefers-color-scheme` |
| App icon | `brand/trail-mark-app-icon.svg` | `#ededef` mark on a `#0b0b0c` tile, radius 57.6 (22.5%) |
| Blue Ground icon | `brand/trail-mark-blue-ground.svg` | White mark on `#0a72ef`, for social cards and the site-switcher tile |

Minimum size 16px. Clear space: half the bar's height on every side. The wordmark is "Trail" in Geist 600, `-0.01em`, beside the mark at 24px with a 10px gap. Never recolour individual shapes, never outline, never rotate, never add a gradient.

`theme-color`: `#0a72ef` on landing pages whose first screen is Blue Ground; `#0b0b0c` (dark) and `#f6f9fe` (light, via media) on docs and the dashboard. The web manifest uses `#0b0b0c`.

## The dot motif

Dots are the product's native unit: one dot is one step someone took. Use them only where they mean something:

- Doto numerals (marketing stats, empty-state counts).
- The footsteps between steps in a journey and in paths to goals: the mark's three descending dots.
- Dot-face avatars (a seeded, mirrored 3 x 3 of the mark's dots).
- Dot grids as texture on Blue Ground: white at 13 to 22% alpha, 0.9 to 1.2px dots on a 16 to 18px tile, always masked to fade.
- The empty-state plane: a 10px dot grid in `border-strong`, fading upward.
- The footer word, built at compile time from dots.

Not as generic decoration on paper sections, not behind text, not on dark product surfaces outside those uses.

## Footsteps

The trail is the story: a visitor walks from a source to a goal. Footsteps are pairs of dots offset by half a step, never a dashed line. Waypoints are 20px white rings (2px). The goal waypoint is a `goal` ring with an inner dot. In motion, footsteps appear one after another (38ms stagger) once, and the goal ring lands last.

## Blue Ground

The marketing ground: `#0a72ef`, with a top-to-bottom gradient to `#0a6ae2` (60%) and `#0753b8`, and a dot-grid sky. It is loud by design, so it is rationed:

- Landing: hero, Journey band, the Bento hero tile, CTA band, footer. Never two Blue Ground sections in a row.
- Dashboard: the demo card and the All websites terrain band only.
- Docs: never.
- Text is white only (see [colour](color.md)). Product UI on Blue Ground is a dark window, never blue-tinted UI.

## Voice of the art

Art is made from the product's own data at build time (seeded, deterministic): the terrain, the ridge, the route, the footer word. No stock imagery, no 3D blobs, no purple gradients.
