# Radius

Eleven role tokens replace the 17 radii found across the three surfaces.

| Role | px | Use |
|---|---|---|
| `cell` | 3 | Heatmap cells |
| `tag` | 4 | Kbd, country code, inline tag, goal badge on marketing |
| `row` | 6 | List rows, chips, delta pills, menu items, copy button |
| `control` | 8 | Buttons, inputs, nav items, search trigger |
| `tooltip` | 10 | Tooltips, callouts, inline detail, the site switcher row |
| `popover` | 12 | Menus, the chart tooltip card, code blocks, product windows, docs tables |
| `panel` | 14 | Dashboard panels, data tables, KPI strip + chart card |
| `overlay` | 16 | Sheets, dialogs, command palette |
| `card` | 20 | Marketing cards |
| `band` | 28 | Marketing CTA band (20, the `card` step, on phones) |
| `pill` | 999 | Marketing buttons, GitHub button, badges, live pill, switch |

## The concentric rule

An inner corner equals the outer corner minus the padding between them:

```
inner radius = outer radius - padding    (never larger; if the result is under 4, use 4 or square)
```

| Outer | Padding | Inner |
|---|---|---|
| Popover 12 | 6 | Menu item 6 |
| Command palette 16 | 6 | Item 10 |
| Segmented control 8 | 2 (inset thumb) | Thumb 6 |
| GitHub button pill (40 tall) | 5 | Star pill 999 (30 tall) |
| Panel 14 | 8 (bar list rows inset) | Row 6 |
| Sheet 16 | 8 inset from the viewport | The viewport is square, so the sheet keeps 16 |

When a child bleeds off an edge (the Bento journey window), only the corners that stay inside are rounded (`12px 0 0 0`).

A product window keeps 12 wherever it sits, because it represents the product, not its container.

## Don'ts

- Do not round something that is cut by a scroll edge.
- Do not use `rounded-full` on rectangular buttons in product. Pills are marketing and status only.
- Do not set `border-radius` on `:focus-visible`: the ring follows the element's own corners.
