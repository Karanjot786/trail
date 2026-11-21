# ChartCard and the chart tooltip card

## ChartCard

The main time-series chart. It sits under the KPI strip (bottom corners `radius-panel`), `surface`, padding `14px 16px 10px`.

```
Readout (min 52px)
  when (caption muted) · value (heading 20/600) + vs-basis (small muted) · top 3 sources · legend
Chart (240px; 300px when the floating card is on; ~520px tall area on phones)
  grid (border, horizontal) · line or bars · previous period (dashed) · notes (diamonds) · signup lane (goal dots)
Recent journeys rail (300px beside at ≥ 1200, below otherwise)
```

- **The header is the tooltip.** Hover or arrow keys rewrite the readout for that day. Clicking a day zooms to hours; first tap reads and second tap zooms on touch.
- Line 2px `chart-1` (or the metric's series colour: colour follows the entity), straight segments, the running bucket dotted. Bars for discrete metrics (revenue): `chart-bar`, previous period as dashed ticks.
- Previous period: `chart-prev`, 1.5px, dash `4 3`. Legend: a 14 x 2 swatch per series, the dashed swatch for "Previous period" or "Compared" (custom), a diamond for notes, a goal dot for signups.
- Axis: `micro` `subtle` tabular. Grid lines `border`.
- Hover: a 1px `muted` hairline and a dot (r 4, 2px `surface` ring).
- Signup lane: uniform `goal` dots with the count printed above, grouped per week when days are narrower than 9px.

## Chart tooltip card

Only on fine pointers wider than 640px.

- 272px, padding `10px 12px`, `raised`, `radius-popover` (12), `elevation-pop`, `caption`.
- Date (`small` 600) with "vs Wed, Nov 11" in `subtle` under it.
- Metric rows (24px grid: key · label · value · delta): only the drawn series gets a colour key; the others are plain rows. The hovered metric's label is `fg`.
- Top 3 referrers with an 18px favicon tile, count and share.
- Footer (1px `border`): the day's note and its signups (goal ring).
- Placement: 16px beside the hairline, flipped left near the right edge, never over the point, clamped inside the card. Opacity fades 120ms; position never animates.

## Keyboard and ARIA

The plot is one focusable `group` (`aria-label="Visitors chart, Sep 22 – Oct 21"`); Left/Right step days, Home/End jump, Enter zooms, Esc zooms out. A polite live region reads the date, all four numbers, the top referrer and the note. A "View as table" link opens the data in a DataTable.

## Tokens

`surface`, `raised`, `elevation-pop`, `border`, `muted`, `subtle`, `fg`, `chart-1..4`, `chart-bar`, `chart-prev`, `goal`, `goal-stroke`, `radius-panel`, `radius-popover`, `type-heading`, `type-micro`.

## Port from

`proto: css/app.css` `.chart-card`, `.readout`, `.legend`, `.chart`, `.ctip` (lines 260-322, 1104-1118), `js/charts.js` `lineChart`, `stackedBars`; `lib: charts/chart-card.tsx`, `charts/chart-theme.ts` (shared axis/grid props), `charts/comparison-chart-header.tsx`.
