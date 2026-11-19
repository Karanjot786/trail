import { XIcon } from 'lucide-react'
import type { Dim } from '@/api'
import { DIM_LABEL, filterValue } from '@/dims'
import { useDashboard } from '@/state'

export function FilterChips() {
  const d = useDashboard()
  const entries = Object.entries(d.filters).filter(([, v]) => v != null) as [Dim, string][]
  if (!entries.length) return null
  const remove = (dim: Dim) => {
    const filters = { ...d.filters }
    delete filters[dim]
    d.set({ filters }, { push: true })
  }
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {entries.map(([dim, value]) => (
        <span
          key={dim}
          className="flex h-8 max-w-full items-center gap-1.5 rounded-full border border-border-strong bg-card pl-3 pr-1 text-sm"
        >
          <span className="shrink-0 text-muted">{DIM_LABEL[dim]} is</span>
          <span className="min-w-0 truncate font-medium text-fg">{filterValue(dim, value)}</span>
          <button
            aria-label={`Remove ${DIM_LABEL[dim]} filter`}
            onClick={() => remove(dim)}
            className="pressable grid size-6 shrink-0 place-items-center rounded-full text-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-3.5" strokeWidth={2} />
          </button>
        </span>
      ))}
      {entries.length > 1 && (
        <button
          onClick={() => d.set({ filters: {} }, { push: true })}
          className="pressable h-8 rounded-full px-3 text-sm text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
