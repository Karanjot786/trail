# Tabs and SegmentedControl

Two different jobs. **Tabs** switch the content of a panel or page. **SegmentedControl** picks one value of a setting (a metric, a grouping, an environment). Both use the same indicator rules.

## Tabs

Anatomy: a row of text tabs with an optional count (`n`, 12px `subtle` tabular) and a 2px `fg` underline on the selected tab, inset 8px from its edges, sitting on the panel's 1px `border`.

| Size | Height | Text |
|---|---|---|
| panel | 42 | `small` 500 |
| page (`tabs-lg`) | 46 | `body` 500 |

Text `muted`; selected and hover `fg`. The underline is `fg`, not blue, everywhere (landing windows, dashboard, docs code groups): blue would claim the tab is data. The underline slides between tabs with `transform: translateX() scaleX()` in `--motion-move`, pointer-initiated only; keyboard changes jump. Overflowing tab rows scroll horizontally with a 24px edge fade, never wrap.

Keyboard and ARIA: `role="tablist"` with `aria-label`; `role="tab"`, `aria-selected`, `aria-controls`; roving tabindex; Left/Right move and activate, Home/End jump. Panels are `role="tabpanel"`. Focus ring is inset (`.ring-inset`).

## SegmentedControl

Anatomy: a `surface` track, 1px `border-strong`, `radius-control` (8), padding 2px; items 28px (`sm` 24px), `small` 500; the selected item sits on a `hover` thumb with radius 6 (8 − 2, concentric) and an inset 1px `border-strong` hairline. Marketing version: 44px pill, thumb `inverse`.

The thumb slides with `translate` + `width` in `--motion-move` (`--ease-in-out`). No-JS fallback: the selected item gets the thumb fill directly.

Keyboard and ARIA: Radix ToggleGroup `type="single"` (`role="radiogroup"` semantics); arrows move and select; the group has an `aria-label`.

## Tokens

`fg`, `muted`, `subtle`, `border`, `border-strong`, `surface`, `hover`, `inverse`, `radius-control`, `radius-row`, `motion-move`, `type-small`.

## Do / don't

- Do keep panel headers to tabs + search + ⋯ menu.
- Don't use tabs for actions or filters.
- Don't put more than 5 items in a segmented control; use a menu.

## Port from

`proto: css/app.css` `.tab`, `.tabs`, `.tabs-lg`, `.page-tabs`, `.seg` (lines 337-350); `lib: ui/segmented-control.tsx` + `hooks/use-sliding-indicator.ts` (copy, swap react-aria for Radix ToggleGroup); `site: sections/Privacy.astro` `.segc` (marketing size); `web: components/TabStrip.tsx` (slider transform).
