# Kbd

A keycap. Min 20 x 20, padding `0 5px`, `radius-tag` (4), 1px `border-strong` with a 2px bottom edge, `raised` fill, `muted` text, Geist 500 12px tabular (not mono). Groups (`⌘ K`) sit in an inline-flex with a 3px gap.

- Render `<kbd>` per key inside a wrapper with the readable shortcut in `aria-label` or adjacent text ("Command K").
- Show the platform glyph: ⌘ on Apple platforms, Ctrl elsewhere.
- Hide every kbd hint under `(hover: none)`.

Tokens: `raised`, `border-strong`, `muted`, `radius-tag`, `type-label`.

Port from: `proto: css/app.css` `.kbd`, `.kbds`; `lib: ui/kbd.tsx` (copy as-is, restyle).
