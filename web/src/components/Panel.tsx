import { useState, type ReactNode } from 'react'
import { ListFilterIcon, Maximize2Icon, MoreHorizontalIcon, UsersIcon, XIcon } from 'lucide-react'
import { api, type Dim } from '@/api'
import { useDashboard, queryKey } from '@/state'
import { useFetch } from '@/useFetch'
import { num, pct } from '@/format'
import { DIM_LABEL, renderKey } from '@/dims'
import { cn } from '@/lib/utils'
import { BarRow } from './BarRow'
import { TabStrip } from './TabStrip'
import { Tooltip } from './ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { ViewAllDialog } from './ViewAllDialog'

export type Column = 'visitors' | 'pct' | 'visitors+total'
export interface PanelTab {
  label: string
  dim: Dim
  column: Column
}

const TOP = 7

export function Panel({
  tabs,
  total,
  empty,
  className,
}: {
  tabs: PanelTab[]
  /** Distinct visitors in range: denominator for % columns. */
  total: number
  /** Rendered when the active tab has no rows. */
  empty?: ReactNode
  className?: string
}) {
  const d = useDashboard()
  const [active, setActive] = useState(tabs[0].dim)
  const tab = tabs.find((t) => t.dim === active) ?? tabs[0]
  const [dialog, setDialog] = useState<null | 'view' | 'filter'>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const { data: rows } = useFetch(queryKey(d.query, 'breakdown', tab.dim, TOP), (s) =>
    api.breakdown(d.query, tab.dim, { limit: TOP }, s),
  )
  const max = rows?.length ? Math.max(...rows.map((r) => r.visitors)) : 1
  const filtered = d.filters[tab.dim]

  const toggle = (key: string) => {
    const filters = { ...d.filters }
    if (filters[tab.dim] === key) delete filters[tab.dim]
    else filters[tab.dim] = key
    d.set({ filters }, { push: true })
  }

  return (
    <section
      className={cn('pill-wrap relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-black', className)}
      data-open={menuOpen || undefined}
      aria-label={tab.label}
    >
      <header className="flex h-16 items-stretch justify-between gap-3 border-b border-border pl-3 pr-4 sm:pl-4 sm:pr-6">
        <TabStrip
          label={`${tabs.map((t) => t.label).join(', ')} breakdown`}
          tabs={tabs.map((t) => ({ value: t.dim, label: t.label }))}
          value={tab.dim}
          onChange={setActive}
        />
        <ColumnLabels column={tab.column} />
      </header>

      <div className="relative min-h-[200px] px-3 pb-14 pt-3 sm:h-[304px] sm:px-4 sm:pb-0">
        {rows && rows.length === 0 ? (
          (empty ?? <p className="grid h-full place-items-center pb-6 text-sm text-muted">No data for this range.</p>)
        ) : (
          <ul className={cn('flex flex-col gap-2', (rows?.length ?? 0) >= TOP && 'fade-bottom')}>
            {(rows ?? []).map((r) => {
              const { label, icon } = renderKey(tab.dim, r.key)
              return (
                <li key={r.key}>
                  <BarRow
                    label={label}
                    icon={icon}
                    share={r.visitors / max}
                    active={filtered === r.key}
                    onClick={() => toggle(r.key)}
                    title={`${label} — click to ${filtered === r.key ? 'remove' : 'add'} filter`}
                    value={
                      tab.column === 'pct' ? (
                        pct(total ? r.visitors / total : 0)
                      ) : tab.column === 'visitors+total' ? (
                        <span className="flex gap-6">
                          <span className="w-14 text-right">{num(r.visitors)}</span>
                          <span className="w-12 text-right">{num(r.total)}</span>
                        </span>
                      ) : (
                        num(r.visitors)
                      )
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {rows && rows.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <span className="pill-stub absolute bottom-0 h-6 w-[84px] rounded-full border border-border bg-black" aria-hidden />
          <div className="pill-actions flex items-center gap-1 rounded-full border border-border-strong bg-[#0f0f0f]/95 p-1 shadow-[0_4px_20px_rgb(0_0_0/0.6)] backdrop-blur">
            <PillButton label="View All" onClick={() => setDialog('view')}>
              <Maximize2Icon />
            </PillButton>
            <PillButton label="Filter" onClick={() => setDialog('filter')}>
              <ListFilterIcon />
            </PillButton>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <Tooltip label="More">
                <DropdownMenuTrigger asChild>
                  <button aria-label="More" className={pillBtn}>
                    <MoreHorizontalIcon />
                  </button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="center" side="top">
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => d.set({ view: 'visitors', person: '' }, { push: true })}>
                    <UsersIcon strokeWidth={1.5} /> View visitors
                  </DropdownMenuItem>
                  {filtered != null && (
                    <DropdownMenuItem
                      onSelect={() => {
                        const filters = { ...d.filters }
                        delete filters[tab.dim]
                        d.set({ filters }, { push: true })
                      }}
                    >
                      <XIcon strokeWidth={1.5} /> Clear {DIM_LABEL[tab.dim].toLowerCase()} filter
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <ViewAllDialog
        open={dialog !== null}
        focusSearch={dialog === 'filter'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={tab.label}
        dim={tab.dim}
        column={tab.column}
        total={total}
        onPick={(key) => {
          setDialog(null)
          toggle(key)
        }}
      />
    </section>
  )
}

const pillBtn =
  'pressable grid h-8 w-11 place-items-center rounded-full text-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-hover data-[state=open]:text-fg [&_svg]:size-[18px] [&_svg]:stroke-[1.75]'

function PillButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip label={label}>
      <button aria-label={label} onClick={onClick} className={pillBtn}>
        {children}
      </button>
    </Tooltip>
  )
}

function ColumnLabels({ column }: { column: Column }) {
  const cls = 'text-[13px] font-medium uppercase tracking-[0.02em] text-muted'
  return (
    <div className="flex shrink-0 items-center gap-6">
      <span className={cls}>Visitors</span>
      {column === 'visitors+total' && <span className={cls}>Total</span>}
    </div>
  )
}
