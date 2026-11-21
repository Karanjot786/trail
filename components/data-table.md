# DataTable (TanStack)

Visitors, Sessions, Events catalogue, full reports, AI crawlers.

## Anatomy

```
Toolbar: count ("1,204 visitors")  · search field · column menu · export
Table:   sticky head · 44px rows (48 touch) · right-aligned numbers
Footer:  "1–25 of 1,204" · page size · prev / next
```

Wrapper `surface`, 1px `border`, `radius-panel`, overflow hidden; horizontal scroll inside `.dt-scroll`. Head cells `label` `subtle` on `surface`, 1px `border` below, sticky. Sortable heads are buttons with a sort arrow; the sorted column's head is `fg`. Body `small`, rows separated by 1px `border`; hover `hover`. Who-cells: avatar + name (600) over a `caption` `muted` subtitle (ellipsis, full value in the row's sheet).

## Props (TanStack-shaped)

`columns: { id, header, cell, accessorFn, meta: { align, kind, definition }, enableHiding, enableSorting }[]`, `data`, `state: { sorting, globalFilter, pagination, columnVisibility }`, `onRowOpen`, `getSearchText`, `emptyState`. Pipeline: core → filtered → sorted → paginated, so `@tanstack/react-table` drops in one to one.

## States

Loading: 8 skeleton rows of the real row height. Empty: an EmptyState inside the table frame. Filtered to nothing: "No visitors match "xyz"" + Clear search. Error: ErrorState with Retry, same frame height.

## Keyboard and ARIA

Native `<table>`. Sortable heads: `<button>` inside `<th aria-sort>`. Rows that open something are focusable (`tabindex="0"`, inset ring, Enter opens) and contain no other tab stops except explicit actions. The column menu is a menu of `menuitemcheckbox`; the last visible column cannot be hidden. Page changes announce "Page 2 of 49".

## Tokens

`surface`, `border`, `hover`, `fg`, `muted`, `subtle`, `ring`, `radius-panel`, `layout-table-row`, `type-small`, `type-label`.

## Don't

No sparklines in rows. No zebra stripes. No sticky first column under 960px (scroll instead).

## Port from

`proto: css/app.css` `.dt*` (lines 444-476, 1201), `js/ui.js` `tableState`/`createTable`; `lib: table/use-data-table.ts` (copy), `table/data-table.tsx` (SortHeader, Toolbar, Empty; drop react-aria); `lib: blocks/data-table` for the TanStack v9 wiring.
