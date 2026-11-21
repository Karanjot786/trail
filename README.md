# Trail Design System

One design system for Trail's landing page (Astro), docs (VitePress) and dashboard (React + Tailwind v4), built so the owner's next projects can reuse it.

- **One source:** `tokens/tokens.json` (DTCG format).
- **Zero dependencies:** `build.mjs` and `check.mjs` are plain Node (18+).
- **Measured, not typed:** every text pair is checked at 4.5:1, every graphic at 3:1, and the measured ratios are stored in the tokens themselves.

```sh
node build.mjs && node check.mjs
```

Open `preview/index.html` straight from disk to see every token, contrast number, the type scale and the core components in all three themes.

## What is here

```
tokens/tokens.json     the single source: primitives → semantic roles → themes (dark, light, blue-ground)
build.mjs              generates dist/ and preview/index.html
check.mjs              validates the tokens; exits 1 on any failure
lib/tokens.mjs         shared resolver and colour maths
dist/
  tokens.css           custom properties; themes via [data-theme] and prefers-color-scheme
  tailwind.css         Tailwind v4 @theme (imports tokens.css)
  vitepress.css        --vp-* overrides, standalone (:root light, .dark dark)
  tokens.ts            typed constants for JS (charts, canvas, tests)
  fonts.css + fonts/   Geist, Geist Mono, Doto, and the metric-matched fallback
  base.css             the one focus ring, smoothing, selection, sr-only, tabular numbers
foundations/           colour, typography, spacing and layout, radius, elevation, motion,
                       iconography, data viz, writing, accessibility, brand
components/            one spec per component (anatomy, props, states, keyboard, ARIA, tokens, source)
brand/                 the one mark and its icon variants
preview/               template.html (source) → index.html (generated, single file)
shots/                 preview screenshots at 1440 in each theme
MIGRATION.md           every current value on the three surfaces → its token
```

## The model

| Layer | Example | Who uses it |
|---|---|---|
| Primitive | `primitive.color.gray.18` = `#121214` | Only themes. Colour steps are named by OKLCH lightness x100 |
| Semantic | `semantic.type.body`, `semantic.radius.panel`, `semantic.motion.popover` | Components |
| Theme | `theme.dark.surface` → `{primitive.color.gray.18}` | Components, via CSS variables (`--surface`) |

Themes: **dark** (Trail black: dashboard and docs default), **light** (paper: the landing, and light mode elsewhere), **blue-ground** (marketing bands only). A theme is an attribute and nests: `<html data-theme="light">` with `<section data-theme="blue-ground">` and a `<figure data-theme="dark">` product window inside it.

Decisions that resolve the inventory's inconsistencies are in [MIGRATION.md](MIGRATION.md#decisions); the rules are in [foundations/](foundations/).

## Using it

### Plain HTML

```html
<link rel="stylesheet" href="dist/fonts.css">
<link rel="stylesheet" href="dist/tokens.css">
<link rel="stylesheet" href="dist/base.css">
<html data-theme="dark"> … <div style="background: var(--surface); color: var(--muted); font: var(--type-body)">
```

Without `data-theme` on `<html>` the page follows `prefers-color-scheme`.

### Astro (landing)

```astro
---
// src/layouts/Landing.astro
import '@trail/design-system/fonts.css';
import '@trail/design-system/tokens.css';
import '@trail/design-system/base.css';
---
<html lang="en" data-theme="light">
  <section data-theme="blue-ground" class="hero">…</section>
```

Preload only `geist-latin-wght-normal.woff2`. Components use roles (`var(--fg)`, `var(--radius-card)`, `transition: transform var(--motion-press)`).

### VitePress (docs)

```ts
// .vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme';
import '@trail/design-system/fonts.css';
import '@trail/design-system/vitepress.css';
import '@trail/design-system/base.css';
export default DefaultTheme;
```

`vitepress.css` is standalone: light values on `:root`, dark on `.dark`, and every `--vp-*` variable pointed at a role. Set `appearance: 'dark'` so docs open dark like the dashboard; the toggle then offers paper.

### React + Tailwind v4 (dashboard)

```css
/* src/index.css */
@import "tailwindcss";
@import "@trail/design-system/fonts.css";
@import "@trail/design-system/tailwind.css";   /* also imports tokens.css */
@import "@trail/design-system/base.css";
```

Utilities read live variables, so the theme attribute switches them: `bg-surface text-muted border-border rounded-panel shadow-pop text-body outline-ring`. Tailwind's default palette, type scale, radii and shadows are removed on purpose: `bg-red-500` and `text-sm` no longer exist. Spacing stays the 4px grid (`p-3` = 12px). For charts and canvas:

```ts
import { themes, chartSeries, heat, motion, cssVar } from '@trail/design-system/tokens';
stroke={cssVar('chart-1')}            // follows the live theme
const blue = themes.dark['chart-1'];  // a resolved hex when a string is required
```

## Adding or changing a token

1. Edit `tokens/tokens.json`.
   - A new colour: add the primitive only if no existing step fits, named by its OKLCH lightness (`check.mjs` tells you the right name). Then add or repoint a role in **both** `dark` and `light` (blue-ground only if marketing bands need it).
   - A new role must have a job no existing role has. Name it by role (`chart-track`), never by look (`light-blue`).
   - If the role is text or a graphic, add its pairs to `$extensions["trail.checks"]`.
2. `node check.mjs --write` measures and stores the ratios in the token's `$extensions["trail.contrast"]`.
3. `node build.mjs && node check.mjs` must pass. Plain `check.mjs` also fails if stored ratios are stale.
4. Update the foundation or component doc that names the role, and MIGRATION.md if it replaces a literal.
5. Bump the version (below), commit, tag.

`check.mjs` enforces: every alias resolves; every primitive name matches its lightness; every primitive has a consumer; dark and light define the same roles and blue-ground a subset; text ≥ 4.5, graphics ≥ 3, heatmap low end ≥ 1.5 in every theme; stored ratios are current.

## Versioning

Semver on `$extensions["trail.version"]` (printed in every generated file), tagged `vX.Y.Z` in this repo.

- **Major:** a role is removed or renamed, a theme changes its meaning, a utility disappears.
- **Minor:** a new role, theme, component spec or output file; a value change that moves a contrast ratio by more than 0.5 or is visible at a glance.
- **Patch:** value nudges inside the same intent, doc fixes, build fixes.

Every release lists changed roles with before/after values in its tag message.

## How Trail consumes it later (plan, not implemented)

| Option | How | For | Against |
|---|---|---|---|
| Copy `dist/` | A script copies `dist/` into `trail/packages/design-system/` | Trivial; no tooling | Drift: nothing stops local edits; versions are invisible |
| git subtree | `git subtree add --prefix=packages/design-system <repo> v1.0.0 --squash`; `subtree pull` to update | Source and history in Trail; works offline; contributors need nothing new | Subtree commands are unfamiliar; local edits can still creep in; pulls are manual |
| npm package | Publish `@trail/design-system` (GitHub Packages or npm) with `exports` for `./tokens.css`, `./tailwind.css`, `./vitepress.css`, `./base.css`, `./fonts.css`, `./tokens` | Versioned, cached, one line to upgrade, works the same for the owner's other projects; Renovate can propose upgrades | Needs a publish step; private registry auth if private |

**Recommendation: a git subtree now, an npm package when a second project uses it.** Trail is MIT and self-hosted, and today it is the only consumer: a subtree keeps the system's source inside the repo (anyone who clones Trail can build it, nothing to authenticate) while keeping one upstream with tags. `trail/packages/design-system` becomes a workspace package named `@trail/design-system`, so imports are already the npm-style paths used above; switching to a published package later changes no import. A CI step in Trail runs `node packages/design-system/check.mjs` and fails on local edits to `dist/` that do not match a rebuild.

## Sources

Dashboard: the approved prototype D v3 (`docs/design/dashboard/proto-d/`). Landing: Blue Ground (`trail/site/src/styles/`, the site components, `site/scripts/art/`, `trail/docs/brand/`). Inventory: `docs/design/2026-11-20-design-tokens-inventory.md`. Components: `docs/design/2026-11-20-ui-library-deep-audit.md` and the owner's library (`chunks-readable/rebuild`). Chart palettes validated with the dataviz six-check validator in both modes.
