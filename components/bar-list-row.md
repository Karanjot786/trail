# BarList row

The ranked list in every Overview panel (Pages, Sources, Countries, Devices, Events) and in Acquisition.

## Anatomy

One CSS grid per list; every row is a subgrid, so columns align across rows and the label column hugs the longest label (up to half the width).

```
[icon/fav] label (ellipsis) ━━━━━━━━━━ (6px bar)   1,204   18%   4.2%   [filter]
```

- Row min 40px (44 coarse), padding `5px 8px`, `radius-row`, `body`.
- Bar: 6px tall, `radius-row` track `chart-track`, fill `chart-bar`, width `value / max` of the list (the one bar scale rule: the top row is always full). The bar is a leader line between label and numbers, never behind the numbers. Hover: fill `accent`.
- Numbers right-aligned, tabular; secondary columns `muted`. "0%" is shown as 0%, never a dash; "n/a" with a reason in a tooltip when the metric does not apply.
- Column heads: `label` `subtle`, right-aligned for numbers, each with an InfoHint where defined ("% of total").
- Trailing 32px filter button (`subtle`; pressed `accent-soft` + `fg`).
- "Other" is a plain text row at the end, no bar.

## Behaviour

- Click (or Enter) on the row opens its report sheet (`?dr=dim|key`). The filter button filters the page. Two jobs, two targets.
- Active filter: `accent-soft` row fill.
- Bars draw with `transform: scaleX()` from the left, 300ms `--ease-out`, on first render only; never on hover or filter.

## Keyboard and ARIA

A `list` of rows; each row is a `button` with an accessible name ("/pricing, 1,204 visitors, 18% of total"); the filter button is `aria-pressed` with "Filter by /pricing". Lists over 10 rows end in "Open full report".

## Tokens

`chart-bar`, `chart-track`, `accent`, `accent-soft`, `hover`, `fg`, `muted`, `subtle`, `radius-row`, `type-body`, `type-label`.

## Port from

`proto: css/app.css` `.rows`, `.brow*`, `.colhead` (lines 337-395, 1144-1155), `js/ui.js` `bar()`, `js/screens.js` `panel()`; `lib: charts/bar-list-card.tsx` (tabs edge fade, share column; replace motion with CSS); `web: components/BarRow.tsx`, `Panel.tsx`.
