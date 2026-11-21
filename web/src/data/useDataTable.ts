// TanStack Table v9 wiring for DataTable (plan Task F3-1). Ported from the owner's library
// (`table/use-data-table.ts` and `blocks/data-table`) and the prototype's `createTable`.
// Pipeline: core -> filtered (global search) -> sorted -> paginated.
// Only DataTable.tsx imports this module, and DataTable is only reached through React.lazy,
// so the TanStack code stays in table chunks.
import { useEffect, useMemo, useState } from 'react'
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type Row,
  type SortingState,
  type ColumnVisibilityState,
  type RowData,
} from '@tanstack/react-table'
import type { TableColumn } from './DataTable'

export const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
})
export type Features = typeof features

export const PAGE_SIZE = 25

/** Empty values sort as the smallest; numbers numerically; text by locale with numeric collation. */
export function compareValues(a: unknown, b: unknown): number {
  const na = a == null || a === ''
  const nb = b == null || b === ''
  if (na || nb) return na === nb ? 0 : na ? -1 : 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export interface UseDataTableOptions<T> {
  columns: TableColumn<T>[]
  data: T[]
  getSearchText?: (row: T) => string
  initialSort?: { id: string; desc: boolean }
  pageSize?: number
  /** Server-side sorting: rows arrive sorted; sort changes go to `onSortingChange`. */
  manualSorting?: boolean
  onSortingChange?: (sort: { id: string; desc: boolean } | null) => void
}

export function useDataTable<T>({ columns, data, getSearchText, initialSort, pageSize = PAGE_SIZE, manualSorting, onSortingChange }: UseDataTableOptions<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [initialSort] : [])
  const [globalFilter, setGlobalFilter] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize })
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const defs = useMemo<ColumnDef<Features, RowData, unknown>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        accessorFn: (r: RowData) => c.accessorFn(r as T),
        header: c.header,
        enableSorting: c.enableSorting ?? true,
        enableHiding: c.enableHiding ?? true,
        ...(c.sortDescFirst != null ? { sortDescFirst: c.sortDescFirst } : {}),
        sortFn: (a: Row<Features, RowData>, b: Row<Features, RowData>, id: string) => compareValues(a.getValue(id), b.getValue(id)),
      })),
    [columns],
  )

  const searchText = useMemo(() => {
    if (getSearchText) return getSearchText
    return (row: T) => columns.map((c) => String(c.accessorFn(row) ?? '')).join(' ')
  }, [columns, getSearchText])

  const table = useTable({
    features,
    columns: defs,
    // TanStack constrains rows to RowData; DataTable keeps T at its edges and casts `row.original` back.
    data: data as RowData[],
    state: { sorting, globalFilter, pagination, columnVisibility },
    onSortingChange: (u: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof u === 'function' ? u(sorting) : u
      setSorting(next)
      onSortingChange?.(next[0] ? { id: next[0].id, desc: next[0].desc } : null)
    },
    manualSorting: !!manualSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: (row: Row<Features, RowData>, _id: string, value: unknown) =>
      searchText(row.original as T).toLocaleLowerCase().includes(String(value).trim().toLocaleLowerCase()),
    // Sorting and data refreshes keep the page; search resets it explicitly.
    autoResetPageIndex: false,
  })

  const filteredCount = table.getFilteredRowModel().rows.length
  const pageCount = Math.max(1, Math.ceil(filteredCount / pagination.pageSize))

  // Data can shrink under the current page (a refetch, a new filter): clamp instead of showing nothing.
  useEffect(() => {
    if (pagination.pageIndex > pageCount - 1) setPagination((p) => ({ ...p, pageIndex: pageCount - 1 }))
  }, [pageCount, pagination.pageIndex])

  const hideable = columns.filter((c) => c.enableHiding !== false)
  const visibleIds = columns.filter((c) => columnVisibility[c.id] !== false).map((c) => c.id)

  return {
    table,
    query: globalFilter,
    setQuery(q: string) {
      setGlobalFilter(q)
      setPagination((p) => ({ ...p, pageIndex: 0 }))
    },
    pageIndex: Math.min(pagination.pageIndex, pageCount - 1),
    pageSize: pagination.pageSize,
    pageCount,
    setPageIndex: (i: number) => setPagination((p) => ({ ...p, pageIndex: Math.max(0, Math.min(i, pageCount - 1)) })),
    filteredCount,
    hideable,
    isVisible: (id: string) => columnVisibility[id] !== false,
    /** The last visible column cannot be hidden. */
    canToggle: (id: string) => !(visibleIds.length === 1 && visibleIds[0] === id),
    setVisible(id: string, on: boolean) {
      if (!on && visibleIds.length <= 1) return
      setColumnVisibility((v) => ({ ...v, [id]: on }))
    },
  }
}
