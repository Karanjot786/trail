// STUB (P0). F2 owns this file (plan §0.10, Task F2-2): keep the props, replace the body.
// BarRowModel and ColumnDef are P0's starting shapes; F2 may extend them (contract change via the coordinator).
import type { Dim, Row } from '../api/types'
import type { DeltaKind } from '../lib/compare'

export interface BarRowModel {
  key: string
  label: string
  value: number // the bar's value: bar(value, max(value in this list))
  dim: Dim
  row: Row
}
export interface ColumnDef {
  id: string
  header: string
  value: (row: BarRowModel) => number | string | null
  kind?: DeltaKind
  definition?: string
  hideable?: boolean
}
export interface BarListProps {
  rows: BarRowModel[]
  columns: ColumnDef[]
  onOpen?: (row: BarRowModel) => void
  onFilter?: (row: BarRowModel) => void
  overlapNote?: string
}

export function BarList({ rows, columns, onOpen }: BarListProps) {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" onClick={() => onOpen?.(r)}>
            {r.label}
          </button>
          {columns.map((c) => (
            <span key={c.id}>{String(c.value(r) ?? '')}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
