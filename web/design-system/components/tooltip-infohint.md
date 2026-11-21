# Tooltip and InfoHint

**Tooltip**: a short label for an icon button or a truncated value. **InfoHint**: a definition attached to a term (a metric name), opened by hover, focus or tap.

## Tooltip

`raised`, `radius-tooltip` (10), padding `6px 10px`, `elevation-pop`, `caption` `fg`, max width 300, an optional kbd. Opens after 280ms hover or immediately on focus; if another tooltip closed in the last 400ms it opens instantly with no transition. In: `scale(.97)` + fade, `--motion-tooltip`, origin at the trigger. Never on touch-only devices for icon buttons (their label is the accessible name). Content is `aria-describedby` on the trigger. Not interactive.

## InfoHint

Trigger: the term itself with a dotted underline (`text-decoration: underline dotted var(--subtle)`, offset 4px) and `cursor: help`, as a `<button type="button">`; or a 22px info icon button in KPI tiles (44px hit area on coarse pointers).

Card: 300px max, padding `10px 12px`, title in `small` 600, text `caption` 1.5, optional source line in `muted`. Opens on hover (280ms), focus, or tap (tap toggles; outside tap closes). Esc closes.

ARIA: the trigger has `aria-describedby` to the card while open; on tap the card is a non-modal popover with `aria-expanded`.

## Tokens

`raised`, `elevation-pop`, `fg`, `muted`, `subtle`, `radius-tooltip`, `motion-tooltip`, `z-tooltip`.

## Do / don't

- Do define every metric that has a method: bounce rate, sessions, % of total, signup rate.
- Don't put links or buttons in a tooltip.
- Don't use `title` attributes as the only tooltip.

## Port from

`proto: css/app.css` `.def`, `.tip` (lines 134-144), `js/ui.js` `showTip`/`hideTip` (instant-after-close rule); `lib: ui/tooltip.tsx` (visuals, touch toggle); `web: components/ui/tooltip.tsx` (Radix base).
