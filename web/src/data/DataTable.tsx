// STUB (P0). F3 owns this file (plan §0.10, Task F3-1): keep the props, replace the body.
// Import it only through React.lazy so the TanStack code lands in table chunks.
import type { ReactNode } from 'react'

export interface TableColumn<T> {
  id: string
  header: string
  cell?: (row: T) => ReactNode
  accessorFn: (row: T) => unknown
  meta?: { align?: 'r'; hideSm?: boolean; definition?: string }
  enableHiding?: boolean
  enableSorting?: boolean
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
}

export default function DataTable<T>({ columns, data, onRowOpen, emptyState }: DataTableProps<T>) {
  if (!data.length) return <>{emptyState}</>
  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.id} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} onClick={onRowOpen ? () => onRowOpen(row) : undefined}>
            {columns.map((c) => (
              <td key={c.id}>{c.cell ? c.cell(row) : String(c.accessorFn(row) ?? '')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
