# EmptyState, Skeleton, ErrorState

Every panel, table, chart and screen has all three, and each keeps the shape of the content it stands in for.

## EmptyState

Teaches the next step.

```
[optional Doto count]           numeral, muted (e.g. "9 / 150")
Title                           body-strong: "No events yet"
Helper sentence                 small, muted, max 56ch, text-wrap: pretty
[primary or secondary action] [link]
dot plane (10px grid of border-strong dots, fading upward, decorative)
```

Padding `28px 24px` (40/28 in a full-screen state card), left-aligned in panels, centred on full screens. The helper sentence says what will appear and the one action that makes it appear. Filtered-to-nothing is a different empty state: "No pages match these filters" + "Clear filters".

## Skeleton

Mirrors the real layout: the same rows, heights and column widths, `raised` blocks with `radius-row`, and a 1.4s shimmer (`rgb(255 255 255 / .05)` on dark, `/.7` on paper) that stops under reduced motion. A one-line note above in `caption` `muted` built from the range ("Loading Sep 22 – Oct 21…"). It lasts one frame plus the query: no minimum timer. Container gets `aria-busy="true"`; the note is the only thing read.

## ErrorState

Same frame and height as the content.

```
[warn icon in danger]  "Could not load this range."       body-strong
"Your data is safe. Check your connection and try again." small muted
[Retry] (secondary)    [Details] (ghost, shows the reason code)
```

`role="alert"` on first appearance. Retry keeps filters and scroll position. Related banners (above the page, `radius-tooltip`, padding `10px 14px`): **offline** (`warn-bg`, warn icon, on real `offline` events), **stale** (a `warn` Badge "Data is 12 min old"), **read-only share** (`accent-soft` + `accent-line`).

## Tokens

`raised`, `border-strong`, `muted`, `fg`, `subtle`, `danger`, `warn`, `warn-bg`, `accent-soft`, `accent-line`, `type-body-strong`, `type-small`, `type-numeral`, `radius-row`, `radius-tooltip`.

## Port from

`proto: css/app.css` `.empty`, `.sk`, `.skel-note`, `.state-card`, `.offline-banner` (lines 790-806, 1064-1087), `js/screens.js` `errorState()`, `skeleton()`, `loadingCopy()`; `web: components/EmptyState.tsx` (already strong; keep its API).
