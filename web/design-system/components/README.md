# Components

One spec per component: anatomy, props, states, keyboard, ARIA, tokens, do/don't and the source to port from. Specs describe behaviour and tokens, not a framework: the dashboard builds them in React (Radix primitives + Tailwind utilities from `dist/tailwind.css`), the landing in Astro, the docs in Vue, all from the same tokens.

Source abbreviations:

| Prefix | Path |
|---|---|
| `proto:` | `/Users/ksd/Desktop/analytics/docs/design/dashboard/proto-d/` (approved dashboard prototype D v3) |
| `lib:` | `/Users/ksd/Desktop/chunks-readable/rebuild/app/src/components/` (the owner's library; copying allowed) |
| `site:` | `trail/site/src/` (landing) |
| `docs:` | `trail/site/docs/.vitepress/theme/` (docs) |
| `web:` | `trail/web/src/` (current dashboard) |

Dependencies (from the library audit): Radix + CSS only. No react-aria-components, no motion. `@tanstack/react-table` for DataTable, `cmdk` optional for the palette. Enter/exit animation keys off Radix `data-state="open|closed"` with CSS transitions and `@starting-style`.

| Group | Specs |
|---|---|
| Actions | [Button](button.md), [CopyButton](copy-button.md) |
| Inputs | [Input](input.md), [Search](search.md), [FilterBar](filter-bar.md), [DateRangePicker and Compare](date-range-compare.md) |
| Small parts | [Kbd](kbd.md), [Badge](badge.md), [Chip](chip.md), [StatusDot](status-dot.md), [DeltaPill](delta-pill.md) |
| Navigation | [Tabs and SegmentedControl](tabs-segmented.md), [Sidebar and Shell](sidebar-shell.md), [SiteSwitcher](site-switcher.md), [CommandPalette](command-palette.md) |
| Overlays | [Menu and Popover](menu-popover.md), [Tooltip and InfoHint](tooltip-infohint.md), [Dialog and Sheet](dialog-sheet.md), [Toast](toast.md) |
| Data | [KPI tile](kpi-tile.md), [ChartCard and chart tooltip card](chart-card.md), [BarList row](bar-list-row.md), [DataTable](data-table.md), [Heatmap](heatmap.md), [Journey timeline](journey-timeline.md) |
| Content | [CodeBlock](code-block.md), [EmptyState, Skeleton, ErrorState](states.md) |
| Marketing | [Nav header and Footer](marketing-header-footer.md) |

Every interactive component shares these rules: the one focus ring (`outline` 2px, offset 2px, `--ring`); `scale(.97)` on `:active` with `--motion-press`; hover rules inside `(hover: hover) and (pointer: fine)`; 44px targets on `(pointer: coarse)`; movement only inside `prefers-reduced-motion: no-preference`.
