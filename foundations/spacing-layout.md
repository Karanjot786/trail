# Spacing and layout

## The 4px grid

Space tokens: `0 2 4 6 8 10 12 14 16 20 24 28 32 40 48 56 64 88 128` (px). In Tailwind, `--spacing: 4px`, so `p-3` is 12px. Use 2, 6, 10 and 14 only inside components (icon gaps, chip padding); layout uses multiples of 8 above 16.

Rhythm inside product:

| Gap | Use |
|---|---|
| 4 | Icon to label in a chip; between kbd keys |
| 6-8 | Icon to label in a button; between chips |
| 12 | Between controls in a toolbar; panel grid on phones |
| 16 | Between panels; panel padding |
| 24 | Page gutter; between page sections |
| 28 | Section heading top margin |

## Product layout (dashboard)

- Rail: 252px, 64px collapsed. The grid snaps on collapse; only the labels fade (150ms, pointer toggles only).
- Header: 60px (56 on phones), sticky, `glass` material with a scroll-edge fade instead of a border.
- Content column: 1280px maximum, 24px gutter (16 on phones). Header, filter bar and content share the column.
- Panels pair by height in a 2-column grid with a 16px gap. An odd last panel spans both columns. Pairs stretch; footers pin.
- KPI strip: 7 columns on wide screens, 4 + 3 below 1180px, 2 columns with a full-width last tile on phones.
- Breakpoints: `sm 640`, `md 960`, `lg 1180`, `xl 1440`. Components may add their own where content breaks (the recent-journeys rail at 1200, the What changed scroller at 1100).

## Docs layout

Nav 64px, sidebar 272px, content 720px, gutter 24px (32 at 48rem).

## Marketing layout

- Wrap: 1240px + 2 x gutter. Gutter 56px, 16px under 700px.
- Header: 72px, fixed. `scroll-padding-top: 88px`.
- Section padding: 128px block (88 on phones). Section head: 18px gap, 56px below (36 on phones).
- Bento: 3 columns, 384px rows, 24px gap; 2 columns at 1180, 1 at 760.

## Control heights

| Size | Height | Use |
|---|---|---|
| sm | 28 | Toolbar buttons, segmented items inside panels |
| md | 34 | Default product control |
| lg | 40 | Forms in dialogs, docs search, phone controls |
| marketing | 48 (46 phone) | Marketing buttons |
| row | 40 | Bar list rows |
| table-row | 44 (48 touch) | Table rows |

On `(pointer: coarse)` every control reaches 44px, by height or by an `::after` hit area.
