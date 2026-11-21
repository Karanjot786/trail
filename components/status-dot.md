# StatusDot

An 8px circle with a 3px soft halo, always followed by a word.

| Status | Dot | Halo | Word |
|---|---|---|---|
| `live` | `success` | `success-bg` | "12 online", "Receiving data" |
| `waiting` | `muted` | none | "Waiting for the first event" (three waiting dots, 1.4s fade) |
| `stale` | `warn` | `warn-bg` | "Data is 12 min old" |
| `error` | `danger` | `danger-bg` | "Blocked by CSP" |

`live` may pulse (halo grows to 5px and fades, 2.4s ease-in-out), only under `prefers-reduced-motion: no-preference`, and only in the Live pill and the rail. The dot is `aria-hidden`; the word is the content. Changes announce through a polite live region.

Tokens: `success`, `success-bg`, `warn`, `warn-bg`, `danger`, `danger-bg`, `muted`.

Port from: `proto: css/app.css` `.dot`, `.dot.pulse`, `.live-pill`, `.install-state`; `lib: ui/chip.tsx` (StatusDot); `site: styles/ui.css` `.online`, `.wait`.
