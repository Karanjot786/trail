# Elevation

Product surfaces are flat. Depth appears only where something floats above the page.

| Level | Token | What | Dark | Light |
|---|---|---|---|---|
| 0 | `border` | Panels, cards, tables: a 1px hairline, no shadow | `#222226` | `#dbe5f6` |
| 1 | `elevation-pop` | Menus, popovers, tooltips, the chart card, toasts | 1px `border-strong` ring + `0 12px 32px /.6` + `0 2px 6px /.45` | ring + ink-tinted `/.14` and `/.08` |
| 2 | `elevation-sheet` | Sheets, dialogs, command palette | 1px ring + `0 24px 80px /.65` | ring + ink `/.22` |
| Scrim | `scrim` | Behind level 2 | black 62% | ink 32% |
| Material | `glass` | Sticky header | `#0b0b0c` at 80% + `blur(14px) saturate(160%)` | paper 82% |

Rules:

- The shadow includes its own 1px edge, so a floating surface never needs a separate border.
- Shadows on dark are pure black; on paper they are ink-tinted; on Blue Ground they are blue-tinted (`elevation-pop` and `elevation-sheet` in the `blue-ground` theme are the marketing window and lifted window shadows).
- Raised surfaces get lighter in dark (`surface` 18 → `raised` 21), never a shadow alone.
- A modal task dims the page (scrim). A parallel panel (the chart card) never does.
- Scroll edges fade (a 12px gradient of `glass`) instead of drawing a divider.
- `prefers-reduced-transparency: reduce` turns `glass` solid; `prefers-contrast: more` turns every hairline into `control`.

Marketing-only depth (component tokens in [the marketing components](../components/marketing-header-footer.md)): Bento card hover `0 24px 48px -28px rgb(7 40 100 / .4)`, the Journey legend's hard offset `6px 6px 0 rgb(6 20 46 / .35)`.
