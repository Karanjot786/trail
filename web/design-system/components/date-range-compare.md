# DateRangePicker and Compare

Two buttons in the header: the range, and what it is compared with.

## Range menu

Trigger: a secondary button with a calendar icon and the range label ("Last 30 days"), the dates on wide screens ("Sep 22 – Oct 21"). Menu: Today, Yesterday, This week, This month, Last month, 7 days, 30 days, 90 days, 12 months, then "Custom range…". Shortcuts shown as kbd (T, Y, W, M, 7, 3, 9, 1).

Custom range: two native `input type="date"` (Start, End) and Apply in a popover; the end cannot precede the start; today is the maximum. A data-start note appears when the range starts before the first event ("Data starts May 25"). An unknown `range=` value in the URL shows a visible note, not a silent fallback. Lazy-load the library's calendar picker only if native inputs prove a problem.

## Compare menu

Trigger: "vs previous period" (or "vs Aug 1 – Aug 30", or "No comparison"). Options: Previous period · Custom period… (a start date; the length follows the range; stored as `cmp=c:YYYY-MM-DD`) · No comparison. Changing to a range of a different length drops a custom start. The legend reads "Compared" for a custom period.

The comparison basis is defined once (`getRange().basis`) and every delta uses it. See the [comparison labelling rule](../foundations/dataviz.md#the-comparison-labelling-rule).

## Keyboard and ARIA

Both are Radix menus (`menuitemradio`, `aria-checked`). The custom forms are popovers with labelled fields; Enter applies, Esc cancels and returns focus.

## Tokens

As [Button](button.md) and [Menu](menu-popover.md), plus `warn-bg` and `warn` for the range note.

## Port from

`proto: js/app.js` range parsing, `js/engine.js` `getRange()`/`compare()`, `css/app.css` `.cmp-custom`, `.range-note`; `lib: ui/date-range-picker.tsx` (presets + draft-then-Apply pattern; lazy chunk only).
