# Colour

Three themes share one set of role names. Components use roles (`--surface`, `--muted`, `--accent`), never primitives (`gray.18`) and never hex. The numbers below are measured by `check.mjs`; the full table lives in each token's `$extensions["trail.contrast"]`.

## Themes

| Theme | Where | Ground | Text |
|---|---|---|---|
| `dark` (Trail black) | Dashboard, docs (default) | `#0b0b0c` canvas, `#121214` panels, `#19191c` raised. No hue in any surface, line or shadow. | `#ededef` / `#a8a8b0` / `#909099` |
| `light` (paper) | Landing, light mode of dashboard and docs | `#f6f9fe` paper, `#ffffff` panels | ink `#06142e` / `#3a4a66` / `#56667f` |
| `blue-ground` | Marketing hero band, CTA band, footer, the demo card | `#0a72ef`, deep `#0753b8`, navy `#06142e` | white only |

A theme is an attribute: `data-theme="dark|light|blue-ground"` on `<html>` or on any section. Nest freely: a dark product window inside a paper page is `<figure data-theme="dark">`.

## The three hues and what each one means

**Blue is interaction and data.** Links, the focus ring, the active nav item, the selected row, the filter pill, chart series 1, the brand mark tile. On marketing, blue is also the ground (Blue Ground). Blue never marks a status.

**Yellow is goals, and only goals.** A goal ring on the chart, the goal-reached badge, the goal moment in a journey, signups on the lane. Yellow is never a focus ring, never a peak outline, never a warning. On paper, yellow fails 3:1, so the light theme draws goal marks in amber `#a86f00` with a `#7a5000` stroke, and keeps the yellow fill only behind ink text (`goal-fill` + `on-goal-fill`, 12.7:1).

**Neutrals carry everything else.** Text, surfaces, lines, the primary button on dark (near-white, because a blue button is neither data nor an active item). If you are unsure, it is neutral.

Status colours (`success`, `danger`, `warn`) are reserved for state. They are never chart series and never decoration.

## Roles

| Role | Job | Never |
|---|---|---|
| `bg` | Page canvas | Inside a panel |
| `bg-subtle` | Sidebar rail, docs alt background | |
| `surface` | Panels, tables, cards, inputs | |
| `raised` | Popovers, tooltips, menus, inline detail | As a page section |
| `hover` / `press` | Interactive fills | At rest |
| `tint` | Quiet tinted band (mist on paper) | Behind data |
| `border` | Decorative hairline (1.3 to 1.7:1) | As the only edge of a control that must be seen |
| `border-strong` | Chip, input and button edges | |
| `control` | Boundaries that must read at 3:1: checkbox, radio, switch off | Hairlines |
| `fg` / `muted` / `subtle` | Three text steps. Every step is 4.5:1 or more on every surface of its theme | A fourth grey |
| `link` | Links | Static text |
| `accent-text` | Brand-coloured static text, such as a marketing eyebrow | Links (use `link`) |
| `accent` / `accent-soft` / `accent-line` | Active item, selection, filter pill | Status |
| `ring` | The focus ring | Anything else |
| `primary` / `on-primary` / `primary-hover` | The one filled action per view | A second filled action |
| `brand` / `on-brand` | The mark tile, brand moments | Buttons on dark |
| `inverse` / `on-inverse` | Toasts | |
| `goal`, `goal-stroke`, `goal-fill`, `on-goal-fill` | Goals | Anything that is not a goal |
| `success`, `danger`, `warn` (+ `-bg`) | Status, with an icon and a word | Series, decoration |
| `chart-1..4`, `chart-bar`, `chart-track`, `chart-prev`, `heat-0..5`, `heat-zero-line` | Data. See [dataviz.md](dataviz.md) | UI chrome |
| `code-bg`, `code-fg`, `code-comment`, `code-keyword`, `code-string` | Code. Code stays dark on paper | |
| `scrim`, `glass`, `elevation-pop`, `elevation-sheet` | Layers. See [elevation.md](elevation.md) | |

## Colour never alone

Every meaning carried by colour has a second carrier:

- Deltas have an arrow and a sign: `↑ +12%`, never a green number alone.
- Status has an icon and a word: a green dot reads "Receiving data".
- Goals have a ring shape and a label, not just yellow.
- Chart series have a legend (two or more series), and up to four are also labelled directly.
- Links in running text are underlined. On Blue Ground every link is underlined.
- Selected rows also get `aria-selected` or `aria-current` and a weight or indicator change.
- The heatmap has a ramp legend with numbers, and the tooltip prints the value.

## Blue Ground limits

- No grey text: `muted` and `subtle` are white. Hierarchy comes from size and weight.
- White on `#0a72ef` is 4.50:1, exactly the floor. Body copy on the band is 16px or larger; anything smaller sits on `surface` (deep, 7.15:1) or `raised` (navy, 18.3:1).
- No charts on Blue Ground. Put a dark product window on it instead (`data-theme="dark"`).
- The focus ring is white (4.5:1), not yellow.
- Allowed places: hero band, Journey band, Bento hero tile, CTA band, footer, the dashboard demo card and the All websites terrain band. Nowhere else.

## Contrast floor (enforced by `check.mjs`)

- Text: 4.5:1 on every surface it can sit on, including hover and press fills.
- Graphics and indicators (ring, accent bar, chart marks, goal marks, control boundaries): 3:1.
- Heatmap low end: 1.5:1 between the zero cell and the first step, because the legend and tooltip carry the value too.

Worst measured pairs: dark text 4.50 (white on brand blue, the mark tile), dark graphic 4.13 (`chart-prev` on raised); light text 4.50 (white on the blue primary button), light graphic 3.35 (`chart-bar` on raised); Blue Ground text 4.50, graphic 3.12 (goal ring on blue).

## Adding a colour

Add a primitive only when a role needs it. Name it by OKLCH lightness x100 (`blue.52` has L = 0.52); `check.mjs` fails if the name and value disagree, or if a primitive has no consumer. Then point a theme role at it, define the role in both `dark` and `light`, run `node check.mjs --write` and add the new pairs to `$extensions["trail.checks"]`.
