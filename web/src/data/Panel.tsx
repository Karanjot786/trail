// STUB (P0). F2 owns this file (plan §0.10, Task F2-2): keep the props, replace the body.
import type { Dim } from '../api/types'
import type { ColumnDef } from './BarList'

export interface PanelTab {
  value: string
  label: string
  dim: Dim
  columns: ColumnDef[]
}
export interface PanelProps {
  id: string
  title: string
  tabs: PanelTab[]
  definition?: string
}

export function Panel({ title }: PanelProps) {
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
    </section>
  )
}
