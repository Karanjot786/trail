# Accessibility

Target: WCAG 2.2 AA on every surface, verified with axe-core and `check.mjs`.

## Focus

One ring for every surface (in `dist/base.css`):

```css
:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.ring-inset:focus-visible { outline-offset: -2px; }   /* tabs, table rows, cells inside clipped containers */
```

`--ring` is `#6aa8ff` on dark (7.7:1 on surface), `#0a63d1` on paper (5.4:1 on bg) and white on Blue Ground (4.5:1). The ring follows the element's own radius; never set `border-radius` in a focus rule. Never `outline: none` without a replacement. Tailwind `ring-2` box-shadow rings are retired: use `outline` so the ring survives `overflow: hidden` parents and forced colours.

Focus order follows reading order. Overlays move focus in, trap it, return it to the trigger on close, and lock body scroll. Esc closes only the top layer (and never clears filters).

## Targets

- 44 x 44px for every control on `(pointer: coarse)`, by size or by an `::after { inset: -6px }` hit area.
- Pointer-fine product controls may be 28 to 34px tall with at least 8px between targets (WCAG 2.5.8: 24px minimum).
- Exception: heatmap cells on phones; the filter palette and row reports cover the same tasks.

## Contrast

- Text 4.5:1 on every surface it can sit on, including hover and press fills. Large text gets no discount in this system.
- Indicators and graphics 3:1: ring, active bar, chart marks, goal marks, checkbox and switch boundaries (`control`).
- Decorative hairlines (`border`, `border-strong`) are exempt. Text inputs are identified by label, fill and placeholder; under `prefers-contrast: more` their edge becomes `control`.
- `check.mjs` enforces all of this and fails the build otherwise.

## Semantics

- Native elements first: `button`, `a`, `details`, `dialog`, `input type="date"`.
- Tabs: `role="tablist"`, `tab`, `tabpanel`, `aria-selected`, roving tabindex, arrows + Home/End.
- Menus: `role="menu"`/`menuitem`/`menuitemcheckbox`, typeahead, arrows, Esc returns focus.
- Grids (heatmap, data table with keyboard rows): one tab stop, arrows inside.
- Live values: `aria-live="polite"` on counts, toasts and the chart readout. Errors use `role="alert"`.
- Icon buttons: `aria-label` on the button. Accessible names begin with the visible text (WCAG 2.5.3).
- Every delta and every colour-coded value has text for screen readers that includes its basis.

## Preferences honoured

`prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast: more`, `prefers-color-scheme` (when no explicit theme), `(hover: hover) and (pointer: fine)` for hover rules, `(hover: none)` to hide keyboard hints, `forced-colors` (outlines, not shadows, carry focus).

## Checks before shipping

`node check.mjs`; axe-core on every route in both themes (0 issues); keyboard-only pass through the command palette, a sheet, a menu and the heatmap; 200% zoom and 320px reflow; VoiceOver read of a KPI tile and the chart readout.
