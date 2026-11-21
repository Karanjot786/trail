# Typography

Three families, one pipeline. Every surface loads the same self-hosted files under the same names from `dist/fonts.css`: `Geist`, `GeistMono`, `Doto`, plus `Geist Fallback` (Arial resized to Geist's metrics, so the swap does not move text). The Fontsource `Geist Variable` packages go away.

## The scale

Eight steps carry the product (12 to 28). One floor step (11) and three display steps carry the edges.

| Role | Size / leading | Weight | Tracking | Use |
|---|---|---|---|---|
| `micro` | 11 / 1.25 | 500 | +0.02em | Chips, axis ticks, country codes. The floor: nothing is smaller |
| `caption` | 12 / 1.45 | 400 | 0 | Hints, metadata, footnotes |
| `label` | 12 / 1.45 | 500 | 0 | Column heads, group labels, kbd |
| `small` | 13 / 1.45 | 400 | 0 | Buttons, tabs, menu items, secondary text |
| `body` | 14 / 1.45 | 400 | 0 | Product UI base |
| `body-strong` | 14 / 1.45 | 600 | 0 | Panel and section headings in product |
| `prose` | 16 / 1.7 | 400 | 0 | Docs reading text; every input on phones |
| `lead` | 18 / 1.5 | 400 | 0 | Marketing body, docs lede |
| `title` | 18 / 1.25 | 600 | -0.01em | Product page title |
| `heading` | 20 / 1.25 | 600 | -0.02em | Card titles, chart readout, journey name, marketing h3 |
| `heading-lg` | 24 / 1.25 | 600 | -0.02em | Docs h2 |
| `stat` | 28 / 1.1 | 600 | -0.025em | The one stat size: KPI values, goal rates, Live count |
| `display-sm` | 36 / 1.1 | 600 | -0.025em | Docs h1 |
| `display-md` | clamp(34, 4.2vw, 52) / 1.04 | 600 | -0.034em | Marketing h2 |
| `display-lg` | clamp(44, 5.3vw, 74) / 1.04 | 600 | -0.04em | The hero h1, one per page |
| `numeral` | clamp(40, 4.4vw, 54) / 1.1 | 900 Doto | 0 | Marketing numerals, empty-state counts |
| `code` | 13 / 1.65 | 400 mono | 0 | Code blocks |
| `kicker` | 12 / 1.1 | 600 | +0.08em, uppercase via CSS | Marketing eyebrow |

In CSS each role is five variables: `--type-body` (a `font` shorthand), `--text-body`, `--leading-body`, `--tracking-body`, `--weight-body`. In Tailwind it is one utility: `text-body` sets size, leading, tracking and weight.

## Weights

400, 500 and 600 for Geist. 900 for Doto. Nothing else. The landing's fractional weights (520, 540, 560, 580, 620) collapse: 520 to 540 become 500, 560 to 620 become 600. Below 18px, never lighter than 400.

## Geist

The voice of every surface. `font-feature-settings: 'ss01'` is on for the whole page (base.css). Tracking tightens as size grows and stays at 0 for reading sizes. Headings use `text-wrap: balance`; descriptions and helper sentences use `text-wrap: pretty`.

## Geist Mono: only for things you could paste

Paths, URLs, IDs, code, user agents, file names, env vars and terminal output. Not for visitor names, axes, deltas, kbd, chips, times, counts, labels or legends: those are Geist with tabular numerals. Mono runs one pixel smaller than the text around it (`calc(1em - 1px)`) so it optically matches.

## Doto: numbers people should feel, not read

- Only digits (the file is a digit subset; `fonts.css` limits it to `0-9` and space with `unicode-range`, so a decimal point or unit falls back to Geist Mono automatically).
- Only at 26px or larger, weight 900.
- Marketing: hero stats, the numbers grid, self-host stats.
- Product: empty and low-data states only ("9 / 150" on a sparse heatmap, "0 purchases"). KPI values are Geist 600, never Doto.
- Never preload Doto.

## Numbers

Every value that changes or lines up in a column uses `font-variant-numeric: tabular-nums` (`.num`, and `time`, `kbd` by default). Percentages under 10 keep one decimal ("4.2%"); larger ones are whole. Durations read "1m 6s".

## Measure and wrapping

- Prose: 68ch maximum. Marketing lede: 34em. Helper text: 56 to 70ch.
- Labels, badges, chips and deltas: `white-space: nowrap`.
- Truncated labels (`text-overflow: ellipsis`) always keep the full value in a tooltip or the row's report.
- Inputs are 16px on coarse pointers so iOS does not zoom.
