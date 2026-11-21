# FilterBar

The active filters, inside the sticky header under the title row.

## Anatomy

`[pill] [pill] … [Clear all]`. Each pill: 30px, `radius-control`, `accent-soft` fill, 1px `accent-line` edge, `small`; text `key` (`muted`) · operator (`caption` `muted`: "is", "is not", "contains") · value (`fg`, mono when a path); a 28px remove button (44 on coarse) with an × icon. "Clear all" is a ghost text button (`muted` → `fg`).

## Behaviour

- Filters live in the URL. Back undoes a filter. **Esc never clears filters**; Shift X or "Clear all" does.
- Clicking a pill's text opens a small popover to change operator or value.
- Adding a filter: the ⌘K palette scoped to filters (`F`), the row filter buttons, chip buttons in sheets, heatmap cells.
- The bar collapses to nothing when empty (no reserved space). On phones it scrolls horizontally, no wrap.
- Goal filters do not push rates to 100%: rates divide by the same filters without the goal filter, and the bar says so in a hint.

## ARIA

`<div role="group" aria-label="Active filters">`; each remove button "Remove filter: Page is /pricing". Adding or removing announces the visitor count politely.

## Tokens

`accent-soft`, `accent-line`, `fg`, `muted`, `hover`, `radius-control`, `type-small`.

## Port from

`proto: css/app.css` `.fbar`, `.fpill` (lines 217-233, 1071-1087); `web: components/FilterChips.tsx`.
