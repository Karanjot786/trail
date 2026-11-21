# Chip

A compact token for a value: an event, a page step, a UTM key, a property value.

24px tall (28 on marketing windows), padding `0 8px`, `radius-row` (6), 1px `border-strong`, `surface` fill, `fg` 12px; an optional key in `subtle` before the value (`utm_source google`).

| Kind | Look |
|---|---|
| default | as above |
| `event` | `accent-soft` fill, `accent-line` edge, zap icon |
| `identified` | `success-bg` fill, `success` text, user icon |
| `outbound` | 1px dashed `border-strong`, `muted`, external icon |
| `exit` | no box, `subtle`, out icon |
| `goal` | `goal-fill`, `on-goal-fill`, ring icon |

Removable chips are [FilterBar pills](filter-bar.md), not chips. A clickable chip is a `<button>` with hover `hover`. Values that are paths or IDs are mono at `calc(1em - 1px)`. Never below 11px.

Tokens: `surface`, `border-strong`, `fg`, `subtle`, `accent-soft`, `accent-line`, `success`, `success-bg`, `goal-fill`, `on-goal-fill`, `radius-row`.

Port from: `proto: css/app.css` `.chip`, `.chip.ev`; `site: styles/ui.css` `.chip`, `.ev`, `.idn`, `.out`, `.left`; `lib: ui/chip.tsx`.
