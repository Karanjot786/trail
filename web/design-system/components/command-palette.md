# CommandPalette

⌘K (Ctrl K). A real command palette built from the data in the current range: pages, sources, countries, devices, events and campaigns become filters; visitors open journeys; screens, sites, ranges and actions are commands. `F` opens it scoped to filters.

## Anatomy

Overlay at `padding-top: 12vh` over `scrim`. Panel `min(640px, 100%)`, max height 70vh, `raised`, `radius-overlay` (16), `elevation-sheet`.

- Input row: 54px, search icon, 16px input, optional scope chip (`accent-soft`, "Filters ×").
- List: padding 6; group heads `label` `subtle`; items min 38px, padding `6px 10px`, `radius-tooltip` (10 = 16 − 6), a 26px icon tile (`hover`; selected: `accent-soft`), title over a `caption` `muted` subtitle, trailing hint or kbd.
- Footer: 1px `border` top, `caption` `muted` key hints (↑↓ to move, ↵ to open, esc to close).
- Empty: "Nothing matches "xyz". Try a page path or a source." centred, `muted`.

## Behaviour

- **No open or close animation.** It is used many times a day.
- Fuzzy match on title and subtitle; recent and current-screen items rank first.
- Selected item follows the pointer and the keys; scrolls into view.

## Keyboard and ARIA

`role="dialog"` with an `aria-label`; the input is a `combobox` (`aria-expanded`, `aria-controls`, `aria-activedescendant`); the list is a `listbox` of `option`s in groups (`role="group"` + `aria-labelledby`). Up/Down, Home/End, Enter, Esc closes and returns focus, Backspace on an empty input removes the scope. Focus stays in the input.

## Tokens

`raised`, `scrim`, `elevation-sheet`, `hover`, `accent-soft`, `border`, `fg`, `muted`, `subtle`, `radius-overlay`, `radius-tooltip`, `z-palette`.

## Port from

`proto: css/app.css` `.cmdk*` (lines 766-783), `js/more.js` (palette data and keys). The library has no palette (audit). Optional `cmdk` (about 5 KB gz) for filtering; keep this markup and styling.
