# Data visualisation

Method: pick the form, assign colour by job, validate the palette, apply mark specs, add the hover layer, then an accessibility pass. The palettes below pass the six-check validator (lightness band, chroma floor, CVD separation, normal-vision floor, contrast) in both modes, on `surface` and on `raised`.

## Colour by job

| Job | Tokens | Rule |
|---|---|---|
| One series (the main chart, bar lists) | `chart-bar` (bars), `chart-1` (lines) | Single hue. The title names it, no legend box |
| Identity (several series) | `chart-1` blue, `chart-2` green, `chart-3` orange, `chart-4` violet | Fixed order, never cycled. A fifth series folds into "Other" or small multiples. Colour follows the entity: a filter never repaints survivors |
| Comparison period | `chart-prev` | Dashed (`4 3`), 1.5px, grey. Never a second hue |
| Magnitude (heatmap) | `heat-0` (zero) + `heat-1..5` | One hue, light to dark (dark theme: dark to light). Continuous OKLCH mix between `heat-1` and `heat-5` |
| Goals and signups | `goal` | Yellow (amber on paper), round marks |
| Status | `success`, `danger`, `warn` | Never a series |

Validated: dark `#3d8bff #20a679 #e0682f #9085e9` on `#121214` (worst CVD ΔE 10.0, normal ΔE 23.6, all 3:1+); light `#0a63d1 #14895f #c9541c #6250d6` on `#ffffff` (CVD ΔE 9.3, normal 23.3).

## Marks

- Lines 2px, round joins, straight segments (no smoothing, ever). Hours and days that have not happened are `null` and not drawn; the running bucket is dotted (`2 4`).
- Bars: 4px rounded data end, anchored square to the baseline, 2px surface gap between adjacent bars.
- Revenue and other discrete events are bars, never lines.
- Grid: `border`, horizontal only. Axis text: `micro`, `subtle`, tabular.
- Hover: a 1px `muted` hairline and a ≥8px dot with a 2px `surface` ring.
- Notes: diamonds with an `fg` stroke. Signups: a lane of uniform `goal` dots with the count printed above.

## The bar scale rule

Every bar is `value / max(values in this list)`. The top row is always a full bar. One function (`bar(value, max)`) draws every bar in the product. No share-of-total scales, no multipliers, no log scales on bar lists. The bar is a 6px soft bar under or after the label, never behind the numbers.

## The comparison labelling rule

Every delta states what it is compared with, everywhere it appears:

- A range is compared with the same span one step back; a single day with the day before; today with the same hours of yesterday.
- The basis appears in the tooltip and to screen readers ("+86%, 41 vs 22 (Wed, Nov 11)"), and once in the freshness line ("Changes are vs Sep 22 – Oct 21").
- Fewer than 5 in the earlier period: show the plain difference ("+7 vs 1"), never "+700%".
- A rate change is written in points. A $0 money value reads "no purchases", never a red −100%.
- A delta is an arrow + sign + number + colour. Never colour alone.

## The tooltip rule

- The chart header is the readout: hovering or arrow keys rewrite it (date, value, change vs basis, top sources, notes).
- On wide fine-pointer screens, a floating card (272px, `raised`, `elevation-pop`) sits 16px beside the hairline and flips left near the right edge. It never covers the hovered point and never animates position.
- Colour keys only for drawn series. Other metrics in the card are plain rows.
- Arrow keys, Home and End step through points; a live region reads the numbers.
- Coarse pointers and widths ≤ 640px: no card; the header readout does the job. First tap reads, second tap zooms.
- A tooltip never opens over its own open menu.

## The heatmap scale

- Linear: colour is the cell's share of the busiest hour, mixed in OKLCH from `heat-1` to `heat-5`. Zero cells are `heat-0` with a `heat-zero-line` outline.
- One ramp legend from 0 to max, starting with a 0 swatch. The peak cell gets a 2px `fg` outline (never yellow) and the busiest hour is written out.
- Below 150 visitor-hours, show "Not enough data yet" with the count so far, in Doto.
- `role="grid"`, one tab stop, arrows/Home/End; Enter filters to weekday and hour.

## Forms

Single number → a stat tile, not a chart. Change over time → line (counts) or bars (discrete events). Ranked categories → bar list. Hour × weekday → heatmap. Funnel → ranked steps with drop-offs. Paths → a ranked list, not a Sankey. Never dual axes. Never pie charts beyond two slices. Never sparklines in table rows.
