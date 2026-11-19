import { useEffect, useRef, useState } from 'react'
import { SearchIcon, UsersIcon } from 'lucide-react'
import { api, type Dim } from '@/api'
import { queryKey, useDashboard } from '@/state'
import { useFetch } from '@/useFetch'
import { num, pct } from '@/format'
import { renderKey } from '@/dims'
import { BarRow } from './BarRow'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { Tooltip } from './ui/tooltip'
import type { Column } from './Panel'

export function ViewAllDialog({
  open,
  onOpenChange,
  title,
  dim,
  column,
  total,
  focusSearch,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  dim: Dim
  column: Column
  total: number
  focusSearch: boolean
  onPick: (key: string) => void
}) {
  const d = useDashboard()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 200)
    return () => clearTimeout(id)
  }, [q])
  useEffect(() => {
    if (!open) {
      setQ('')
      setDebounced('')
    }
  }, [open])

  const { data: rows, loading } = useFetch(open ? queryKey(d.query, 'all', dim, debounced) : null, (s) =>
    api.breakdown(d.query, dim, { limit: 100, q: debounced }, s),
  )
  const max = rows?.length ? Math.max(...rows.map((r) => r.visitors)) : 1
  const second = dim === 'event' ? 'Total' : 'Page Views'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          if (focusSearch || matchMedia('(hover: hover)').matches) input.current?.focus()
        }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border py-5 pl-5 pr-[62px] sm:pl-6">
          <DialogTitle className="text-lg font-medium tracking-[-0.01em] text-fg">{title}</DialogTitle>
          <div className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.02em] text-muted" aria-hidden>
            <span className="w-14 whitespace-nowrap sm:w-16">Visitors</span>
            <span className="w-[76px] whitespace-nowrap text-right">{second}</span>
          </div>
        </div>
        <DialogDescription className="sr-only">
          All {title.toLowerCase()} for the selected range. Pick a row to filter the dashboard.
        </DialogDescription>

        <div className="px-2.5 pt-2.5">
          <label className="flex h-10 items-center gap-3 rounded-lg border border-border-strong bg-black px-3 focus-within:ring-2 focus-within:ring-ring">
            <SearchIcon className="size-[18px] shrink-0 text-muted" strokeWidth={1.5} aria-hidden />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              aria-label={`Search ${title.toLowerCase()}`}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle"
            />
          </label>
        </div>

        <ul className="flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2.5 py-2.5" aria-busy={loading}>
          {rows?.length === 0 && <li className="py-10 text-center text-sm text-muted">No matches.</li>}
          {(rows ?? []).map((r) => {
            const { label, icon } = renderKey(dim, r.key)
            return (
              <li key={r.key} className="group/item flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <BarRow
                    label={label}
                    icon={icon}
                    share={r.visitors / max}
                    active={d.filters[dim] === r.key}
                    onClick={() => onPick(r.key)}
                    extra={
                      column !== 'visitors+total' && (
                        <span className="num relative hidden shrink-0 border-r border-border-strong pr-2 text-muted sm:inline">
                          {pct(total ? r.visitors / total : 0)}
                        </span>
                      )
                    }
                    value={
                      <span className="flex items-center">
                        <span className="w-14 text-left sm:w-16">{num(r.visitors)}</span>
                        <span className="w-[76px] text-right">{num(dim === 'event' ? r.total : r.pageviews)}</span>
                      </span>
                    }
                  />
                </div>
                <Tooltip label="View visitors" side="left">
                  <button
                    aria-label={`View visitors for ${label}`}
                    onClick={() => {
                      onOpenChange(false)
                      d.set({ filters: { ...d.filters, [dim]: r.key }, view: 'visitors', person: '' }, { push: true })
                    }}
                    className="pressable grid size-8 shrink-0 place-items-center rounded-md text-subtle outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover/item:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <UsersIcon className="size-4" strokeWidth={1.5} />
                  </button>
                </Tooltip>
              </li>
            )
          })}
        </ul>

        <div className="border-t border-border p-2.5">
          <DialogClose className="pressable h-10 w-full rounded-lg border border-border-strong bg-black text-[15px] font-medium text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring">
            Close
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
