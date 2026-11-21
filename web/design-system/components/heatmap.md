# Heatmap

Visitors by weekday and hour over four weeks.

## Anatomy

```
Callout: "Busiest: Tuesdays 10:00 – 11:00, 84 visitors"
Grid: 34px weekday column + 24 hour columns, 3px gap, cells aspect 1.5 (min 14px tall), radius-cell
Foot: ramp legend 0 ━━━ max · peak swatch · method line
```

- Cell colour: `color-mix(in oklch, var(--heat-5) t%, var(--heat-1))` where `t = value / max`. Zero cells: `heat-0` with an inset 1px `heat-zero-line`.
- Peak cell: 2px `fg` outline (never yellow).
- Legend: a 0 swatch, then a 140 x 10 OKLCH ramp from `heat-1` to `heat-5` with "0" and the max printed.
- Method (`caption` `subtle`): "Colour is each hour's share of the busiest hour. India time. Last 4 weeks."
- Under 150 visitor-hours: "Not enough data yet" with the count so far in Doto ("9 / 150").

## Keyboard and ARIA

`role="grid"` with weekday rows (`role="row"`) and cells (`role="gridcell"`), one tab stop. Arrows move, Home/End jump within the row, Enter (or click) filters to that weekday **and** hour. Each cell's name: "Tuesday 10:00, 84 visitors". Hover and focus show a tooltip with the value.

## Tokens

`heat-0`, `heat-1..5`, `heat-zero-line`, `fg`, `muted`, `subtle`, `raised`, `radius-cell`, `type-micro`, `type-numeral`.

## Port from

`proto: css/app.css` heatmap block (lines 407-432, 1156-1162), `js/screens.js` `heatPanel()`; `lib: charts/heatmap-chart-card.tsx` (structure only).
