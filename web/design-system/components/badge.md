# Badge

A static label for counts and states. Not clickable.

20px tall, padding `0 7px`, `radius-pill`, Geist 500 12px, `nowrap`, optional 12px icon.

| Tone | Fill | Edge | Text |
|---|---|---|---|
| `neutral` | `raised` | `border` | `muted` |
| `accent` | `accent-soft` | `accent-line` | `fg` |
| `success` | `success-bg` | none | `success` |
| `warn` | `warn-bg` | none | `warn` |
| `danger` | `danger-bg` | none | `danger` |
| `goal` | `goal-fill` | none | `on-goal-fill`, 600 |

Status tones always carry a word ("Receiving data", "Data is 12 min old"), never colour alone. The goal badge reads "Goal reached" or the goal name. On marketing windows the goal badge uses `radius-tag` and 11px.

Props: `tone`, `icon`. ARIA: plain text; counts inside nav items get `aria-label` context ("12 new").

Port from: `proto: css/app.css` `.badge*`; `lib: ui/badge.tsx`; `site: styles/ui.css` `.badge`, `.reached`.
