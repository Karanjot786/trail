# KPI tile

The row of headline numbers above the chart. Each tile is also the chart's metric switch.

## Anatomy

```
[label  (i)]            small 500 muted, InfoHint button
1,204                   stat: 28 / 600 / -0.025em / tabular (22 on phones)
[↑ +12%] vs 414         DeltaPill + basis in caption subtle
```

Padding `14px 16px 12px`, gap 6. Tiles share one `surface` strip (1px `border`, top corners `radius-panel`, joined to the chart card below), divided by 1px `border`. Columns: 7 wide, 4 + 3 below 1180, 2 on phones with a full-width last tile.

## States

- Rest: value in `muted`. Hover: `hover` fill, value `fg`.
- Selected (the charted metric): value `fg` and a 2px `fg` bar along the bottom edge.
- Loading: a skeleton bar the width of a typical value. No count-up.
- No data: "–" is not used; the value reads "0" or "no purchases" with a sentence in the hint.
- Revenue tile appears only if the site has ever sent a `Purchase` event.

## Keyboard and ARIA

The tiles form a `tablist` controlling the chart (`role="tab"`, `aria-selected`), with arrows and `1–7`. The whole tile is the hit area (`::before` over the tile); the info button stays separately focusable above it. The tab's accessible name is "Visitors, 1,204, up 12% vs 414".

## Tokens

`surface`, `border`, `hover`, `fg`, `muted`, `subtle`, `type-stat`, `type-small`, `radius-panel`.

## Don't

Don't colour the value. Don't use Doto for KPI values. Don't add a sparkline to the tile when the chart sits directly below.

## Port from

`proto: css/app.css` `.kpis`, `.kpi*` (lines 241-259, 1011+); `lib: ui/stat-cards.tsx` (StatCards); `web: components/KpiTabs.tsx` (tab semantics).
