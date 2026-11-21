# Menu and Popover

**Menu**: a list of actions or options (panel ⋯ menu, range menu, column toggles). **Popover**: any non-modal floating content anchored to a trigger (the switcher, the custom compare form).

## Anatomy

A `raised` surface, `radius-popover` (12), padding 6, `elevation-pop`, min width 220, max `min(360px, 100vw − 24px)`, max height `min(70vh, 520px)` scrolling.

- Item: min 34px (44 coarse), padding `6px 10px`, `radius-row` (6: concentric with 12 − 6), gap 10, `small`; optional icon (muted), trailing hint or kbd in `muted` `caption`.
- Group label: `label`, `subtle`, padding `8px 10px 4px`.
- Separator: 1px `border`, margin `6px 4px`.
- Checkbox item: a real 16px checkbox (see [Input](input.md)); the last visible column cannot be unticked.
- Selected item: a 16px `accent` check before the label.

## Motion

In: from `scale(.97) translateY(-2px)` + opacity 0, `--motion-popover`, `transform-origin` at the trigger (Radix `--radix-popper-transform-origin`). Out: `--motion-exit`. Opened from the keyboard: no animation. Reduced motion: opacity only.

## Keyboard and ARIA

Radix DropdownMenu / Popover. Trigger `aria-haspopup`, `aria-expanded`. Up/Down move, Home/End, typeahead, Enter/Space select, Esc closes and returns focus to the trigger, Tab closes. Outside pointerdown closes. Checkbox items are `menuitemcheckbox` with `aria-checked`. Re-pressing an open trigger closes it (no reopen flicker). A tooltip never opens over its own open menu.

## Tokens

`raised`, `elevation-pop`, `hover`, `fg`, `muted`, `subtle`, `border`, `accent`, `radius-popover`, `radius-row`, `motion-popover`, `motion-exit`, `z-popover`.

## Do / don't

- Do put the panel's Columns group first in its ⋯ menu.
- Don't nest submenus more than one level.
- Don't put forms longer than two fields in a popover; use a dialog.

## Port from

`proto: css/app.css` `.pop`, `.mi`, `.ph`, `.sep` (lines 477-495), `js/ui.js` `openPop`/`closePop` (dismiss rules); `lib: ui/menu-styles.ts`, `ui/dropdown.tsx` (`useTriggerToggle`), `ui/popover.tsx`; `web: components/ui/dropdown-menu.tsx` (Radix base).
