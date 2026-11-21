// DataTable (plan §0.10, Task F3-1): TanStack Table v9 behind a native <table>.
// Import it only through React.lazy so the TanStack code lands in table chunks:
//   const DataTable = lazy(() => import('../../data/DataTable'))
// Look: prototype D v3.1 `.dt*` and design-system/components/data-table.md.
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Download, Funnel, Search, X } from 'lucide-react'
import { fmtInt } from '../lib/format'
import { Button } from '../ui/button'
import { Menu, MenuCheckbox } from '../ui/menu'
import { EmptyState, ErrorState, Skeleton } from '../ui/states'
import { useDataTable } from './useDataTable'

export interface TableColumn<T> {
  id: string
  header: string
  cell?: (row: T) => ReactNode
  accessorFn: (row: T) => unknown
  meta?: { align?: 'r'; hideSm?: boolean; definition?: string }
  enableHiding?: boolean
  enableSorting?: boolean
  /** F3 addition: the first click sorts descending (counts, durations, dates). */
  sortDescFirst?: boolean
}
export interface DataTableProps<T> {
  columns: TableColumn<T>[]
  data: T[]
  total?: number
  onRowOpen?: (row: T) => void
  getSearchText?: (row: T) => string
  emptyState: ReactNode
  initialSort?: { id: string; desc: boolean }
  exportHref?: string
  loading?: boolean
  error?: Error | null
  onRetry?: () => void
  // Optional additions (F3, additive to §0.10):
  /** Plural noun for the count, search label and no-match text ("visitors"). */
  noun?: string
  /** Singular noun ("visitor"); defaults to `noun`. */
  nounOne?: string
  /** Screen-reader caption; defaults to the noun. */
  caption?: string
  pageSize?: number
  /** Row Filter action: a trailing button per row. Leave it out on read-only share links. */
  onRowFilter?: (row: T) => void
  /** "source Google" → the button reads "Filter by source Google". */
  getRowFilterLabel?: (row: T) => string
  isRowFiltered?: (row: T) => boolean
  /** Server-side sorting: `data` arrives sorted; header clicks call `onSortingChange`. */
  manualSorting?: boolean
  onSortingChange?: (sort: { id: string; desc: boolean } | null) => void
  /** Replaces the toolbar count text ("1,204 people · 50 loaded"). */
  countText?: string
  /** Under the pager: e.g. a Load more button for server-paged lists. */
  footer?: ReactNode
  /** Accessible name per row (rows that open something). */
  getRowLabel?: (row: T) => string
}

const SKELETON_ROWS = 8
const HOVER = '[@media(pointer:fine)]:hover:'
const RING = 'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2'
const FRAME = 'bg-surface border border-border rounded-panel overflow-hidden'

function alignCls(c: TableColumn<unknown>) {
  return [c.meta?.align === 'r' ? 'text-right tabular-nums whitespace-nowrap' : '', c.meta?.hideSm ? 'max-sm:hidden' : '']
    .filter(Boolean)
    .join(' ')
}

export default function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    data,
    total,
    onRowOpen,
    getSearchText,
    emptyState,
    initialSort,
    exportHref,
    loading = false,
    error = null,
    onRetry,
    noun = 'rows',
    nounOne,
    caption,
    pageSize,
    onRowFilter,
    getRowFilterLabel,
    isRowFiltered,
    manualSorting,
    onSortingChange,
    countText,
    footer,
    getRowLabel,
  } = props
  const dt = useDataTable({ columns, data, getSearchText, initialSort, pageSize, manualSorting, onSortingChange })
  const [announce, setAnnounce] = useState('')

  if (error) {
    return (
      <div className={FRAME}>
        <ErrorState onRetry={onRetry ?? (() => {})} />
      </div>
    )
  }
  if (!loading && data.length === 0) return <div className={FRAME}>{emptyState}</div>

  const { table } = dt
  const visible = columns.filter((c) => dt.isVisible(c.id))
  const byId = new Map(columns.map((c) => [c.id, c]))
  const rows = table.getRowModel().rows
  const q = dt.query.trim()
  const shownCount = q ? dt.filteredCount : (total ?? data.length)
  const start = dt.pageIndex * dt.pageSize
  const colSpan = visible.length + (onRowFilter ? 1 : 0)

  const goTo = (i: number) => {
    dt.setPageIndex(i)
    setAnnounce(`Page ${i + 1} of ${dt.pageCount}`)
  }

  const onRowKey = (row: T) => (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRowOpen?.(row)
    }
  }

  return (
    <div className={FRAME} data-table="">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <label className="relative flex min-w-0 flex-1 items-center sm:max-w-72 max-sm:basis-full">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 size-4 text-subtle" />
          <span className="sr-only">Search {noun}</span>
          <input
            type="search"
            data-table-search=""
            value={dt.query}
            onChange={(e) => dt.setQuery(e.target.value)}
            placeholder={`Search ${noun}…`}
            autoComplete="off"
            spellCheck={false}
            className={`h-8 w-full rounded-control border border-border bg-bg pl-8 pr-2 text-small text-fg placeholder:text-subtle pointer-coarse:h-11 ${RING}`}
          />
        </label>
        <span className="flex-1" />
        <span data-testid="dt-count" className="text-small text-muted">
          {countText && !q ? (
            countText
          ) : (
            <>
              <b className="font-semibold tabular-nums text-fg">{fmtInt(shownCount)}</b>
              {` ${shownCount === 1 ? (nounOne ?? noun) : noun}${q ? ' match' : ''}`}
            </>
          )}
        </span>
        {dt.hideable.length > 0 && (
          <Menu
            label="Columns"
            trigger={
              <Button size="sm" aria-label="Columns" className={`inline-flex items-center gap-1.5 ${RING}`}>
                <Columns3 aria-hidden="true" className="size-4" />
                <span className="max-sm:hidden">Columns</span>
              </Button>
            }
          >
            {dt.hideable.map((c) => (
              <MenuCheckbox
                key={c.id}
                checked={dt.isVisible(c.id)}
                disabled={dt.isVisible(c.id) && !dt.canToggle(c.id)}
                onCheckedChange={(on) => dt.setVisible(c.id, on)}
              >
                {c.header}
              </MenuCheckbox>
            ))}
          </Menu>
        )}
        {exportHref && (
          <a
            href={exportHref}
            download
            className={`inline-flex h-8 items-center gap-1.5 rounded-control border border-border px-2.5 text-small text-fg pointer-coarse:h-11 ${HOVER}bg-hover ${RING}`}
          >
            <Download aria-hidden="true" className="size-4" />
            Export CSV
          </a>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-small" aria-busy={loading || undefined}>
          <caption className="sr-only">{caption ?? noun}</caption>
          <thead>
            <tr>
              {table.getVisibleLeafColumns().map((col) => {
                const c = byId.get(col.id)!
                const sorted = col.getIsSorted()
                const sortable = col.getCanSort()
                const right = c.meta?.align === 'r'
                const cls = `sticky top-0 bg-surface border-b border-border p-0 text-label text-subtle whitespace-nowrap ${right ? 'text-right' : 'text-left'} ${c.meta?.hideSm ? 'max-sm:hidden' : ''}`
                const inner = `flex min-h-8 w-full items-center gap-1 px-3 py-2.5 ${right ? 'justify-end' : ''}`
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={cls}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    title={c.meta?.definition}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={col.getToggleSortingHandler()}
                        className={`${inner} cursor-pointer ${sorted ? 'text-fg' : ''} ${HOVER}text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2`}
                      >
                        {c.header}
                        {sorted === 'asc' ? (
                          <ArrowUp aria-hidden="true" className="size-3.5" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown aria-hidden="true" className="size-3.5" />
                        ) : (
                          <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-60" />
                        )}
                      </button>
                    ) : (
                      <span className={inner}>{c.header}</span>
                    )}
                  </th>
                )
              })}
              {onRowFilter && (
                <th scope="col" className="sticky top-0 w-12 bg-surface border-b border-border p-0">
                  <span className="sr-only">Filter</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <tr key={i} data-skeleton="" aria-hidden="true" className="border-b border-border last:border-b-0">
                    {Array.from({ length: colSpan }, (_, j) => (
                      <td key={j} className="h-11 px-3 py-1 pointer-coarse:h-12">
                        <Skeleton height={12} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.length === 0
                ? (
                    <tr>
                      <td colSpan={colSpan}>
                        <EmptyState
                          title={`No ${noun} match “${q}”`}
                          body="Search looks at the labels in this table. Filters at the top also apply."
                          action={
                            <Button size="sm" onClick={() => dt.setQuery('')} className={RING}>
                              Clear search
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  )
                : rows.map((row) => {
                    const r = row.original as T
                    const filtered = isRowFiltered?.(r) ?? false
                    const label = getRowFilterLabel?.(r) ?? ''
                    return (
                      <tr
                        key={row.id}
                        tabIndex={onRowOpen ? 0 : undefined}
                        aria-label={onRowOpen && getRowLabel ? getRowLabel(r) : undefined}
                        onClick={onRowOpen ? () => onRowOpen(r) : undefined}
                        onKeyDown={onRowOpen ? onRowKey(r) : undefined}
                        className={`border-b border-border last:border-b-0 ${onRowOpen ? `cursor-pointer transition-colors duration-[120ms] motion-reduce:transition-none ${HOVER}bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2` : ''}`}
                      >
                        {visible.map((c) => (
                          <td
                            key={c.id}
                            className={`h-11 px-3 py-1 align-middle leading-[1.3] pointer-coarse:h-12 ${alignCls(c as TableColumn<unknown>)}`}
                          >
                            {c.cell ? c.cell(r) : String(c.accessorFn(r) ?? '')}
                          </td>
                        ))}
                        {onRowFilter && (
                          <td className="h-11 w-12 px-2 py-1 text-right pointer-coarse:h-12">
                            <button
                              type="button"
                              aria-pressed={filtered}
                              aria-label={filtered ? `Remove filter ${label}` : `Filter by ${label}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                onRowFilter(r)
                              }}
                              onKeyDown={(e) => e.stopPropagation()}
                              className={`inline-grid size-8 place-items-center rounded-control pointer-coarse:size-11 ${filtered ? 'bg-accent-soft text-fg' : 'text-subtle'} ${HOVER}bg-hover ${HOVER}text-fg ${RING}`}
                            >
                              {filtered ? <X aria-hidden="true" className="size-4" /> : <Funnel aria-hidden="true" className="size-4" />}
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5 text-small text-muted">
        <span className="tabular-nums">
          {dt.filteredCount ? `Rows ${fmtInt(start + 1)}–${fmtInt(Math.min(dt.filteredCount, start + dt.pageSize))}` : 'Rows 0'} of{' '}
          {fmtInt(dt.filteredCount)}
        </span>
        <span className="flex-1" />
        <Button
          size="sm"
          aria-label="Previous page"
          disabled={dt.pageIndex === 0}
          onClick={() => goTo(dt.pageIndex - 1)}
          className={`inline-grid size-8 place-items-center pointer-coarse:size-11 disabled:opacity-40 ${RING}`}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <span className="tabular-nums">
          Page {dt.pageIndex + 1} of {dt.pageCount}
        </span>
        <Button
          size="sm"
          aria-label="Next page"
          disabled={dt.pageIndex >= dt.pageCount - 1}
          onClick={() => goTo(dt.pageIndex + 1)}
          className={`inline-grid size-8 place-items-center pointer-coarse:size-11 disabled:opacity-40 ${RING}`}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {footer}
      <div role="status" aria-live="polite" className="sr-only" data-testid="dt-announce">
        {announce}
      </div>
    </div>
  )
}
