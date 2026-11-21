# Search

Two patterns: the **search trigger** (opens the command palette or docs search) and the **inline filter field** (filters a panel or table in place).

## Search trigger

Anatomy: `[search icon] "Search or jump to…" [⌘ K]`. 36px, full width of the rail (40px square when collapsed), `surface` fill, 1px `border`, `radius-control`, text `muted` `small`. Hover: edge `border-strong`, text `fg`. Kbd hints hidden on `(hover: none)`. It is a `<button>` with `aria-haspopup="dialog"` and `aria-keyshortcuts="Meta+K Control+K"`. The docs nav uses the same component (36px, 40 on phones).

## Inline filter field

Anatomy: `[search icon 14] input [clear ×]`. 32px in panel headers, 34px in table toolbars; `bg` well inside the panel, 1px `border-strong`, `radius-control`. Placeholder names what is searched ("Search pages"). Typing filters live with no debounce under 2,000 rows. Esc clears the text first, then blurs. The result count is announced politely ("12 pages").

## ARIA

`<input type="search" aria-label="Search pages">`; `aria-controls` the list it filters.

## Tokens

`surface`, `bg`, `border`, `border-strong`, `muted`, `subtle`, `fg`, `radius-control`, `type-small`.

## Don't

Don't bind ⌘L (it is the browser address bar). Don't animate the trigger morphing into a field.

## Port from

`proto: css/app.css` `.search-trigger`, `.psearch`, `.field` (lines 166-168, 393-394, 452-455). `docs: TrailNavBar.vue` (docs trigger). `lib: shell/sidebar.tsx` trigger layout (not its ⌘L binding).
