// The one way screens reach DataTable: React.lazy, so `@tanstack/react-table` lands in a table chunk
// and never in the entry chunk (plan Task F3-1, performance budget). Other screens may import this too.
import { lazy, Suspense, type ReactNode } from 'react'
import type { DataTableProps } from '../../data/DataTable'
import { Skeleton } from '../../ui/states'

const DataTableChunk = lazy(() => import('../../data/DataTable'))

function TableFallback() {
  return (
    <div className="bg-surface border border-border rounded-panel overflow-hidden" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex h-11 items-center px-3 border-b border-border last:border-b-0 pointer-coarse:h-12">
          <Skeleton height={12} />
        </div>
      ))}
    </div>
  )
}

export default function LazyTable<T>(props: DataTableProps<T>) {
  const Table = DataTableChunk as unknown as (p: DataTableProps<T>) => ReactNode
  return (
    <Suspense fallback={<TableFallback />}>
      <Table {...props} />
    </Suspense>
  )
}
