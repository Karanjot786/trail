# Iconography

- **One family:** Lucide. React uses `lucide-react`; Astro and VitePress use an SVG sprite generated from the same Lucide paths (`<svg class="i"><use href="#i-name"/></svg>`). No icon fonts, no emoji, no raster icons, no Unicode glyphs standing in for icons.
- **One stroke:** 1.6 at 16px, everywhere (the landing's 1.75, Lucide's default 2 and the dashboard's mixed 1.5/1.75/2 all become 1.6). Tiny glyphs inside pills (deltas at 12px, the copy check) use 2.2 so they hold their weight.
- **Sizes:** 12 (inside deltas and chips), 14 (`.i-sm`, inline with 13px text), 16 (default), 18 (nav items, header buttons). 20+ only for empty states and marketing.
- `stroke: currentColor; fill: none; stroke-linecap: round; stroke-linejoin: round; flex: none`. Icons take the text colour of their context; they never carry a colour of their own except status icons (`success`, `danger`, `warn`) and the goal ring.
- Decorative icons get `aria-hidden="true" focusable="false"`. Icon-only buttons get `aria-label` on the button, not a `<title>` in the SVG.
- The GitHub mark and the star are in the sprite once; no inline copies.
- Favicon tiles for sources (`fav`): 18px, radius 4, a first-letter initial in Geist 500 11px when there is no real favicon. AI sources get the inverse tile.
- Country codes (`cc`): 24 x 18, radius 4, Geist 500 11px, `+0.03em`. Not flags.
- Avatars are dot faces: a seeded, mirrored 3 x 3 of the mark's dots on a hue tile. Identity, not chrome: their hues are exempt from the palette.

Sprite set (20 symbols today): check, copy, zap, user, chev, chevd, out, ext, warn, back, plus, activity, laptop, phone, db, folder, shield, star, x, cursor; plus github. Add a symbol by copying its Lucide path; do not draw new icons.
