// An Overview panel (Task F2-2): tabs from p.<panel> in the URL, 7 rows of BarList plus "Show all N",
// a ⋯ menu with Columns, Export CSV/JSON, Copy as API call and Open full report. The exit tab adds the
// "Loses people most" sort. Rows open their report (dr=); the Filter button adds f= (not in share mode).
import { useMemo, useState } from 'react'
import { api } from '../api/client'
import type { Dim, Filter } from '../api/types'
import { useQuery } from '../api/useQuery'
import { viewerTz } from '../shell/labels'
import { useSite } from '../shell/useSite'
import { useStats } from '../shell/useStats'
import { apiQuery } from '../state/url'
import { navigate, useUrlState } from '../state/useUrlState'
import { Menu, MenuCheckbox, MenuItem, MenuLabel, MenuSeparator } from '../ui/menu'
import { EmptyState, ErrorState, Skeleton } from '../ui/states'
import { Segmented, Tabs } from '../ui/tabs'
import { toast } from '../ui/toast'
import { BarList, type BarRowModel, type ColumnDef } from './BarList'
import { losesMost, overlapNoteFor, toggleColumn, toRows } from './columns'
import './data.css'

export interface PanelTab {
  value: string
  label: string
  dim: Dim
  columns: ColumnDef[]
  /** F2 addition: the tab's one-line definition. */
  definition?: string
}
export interface PanelProps {
  id: string
  title: string
  tabs: PanelTab[]
  definition?: string
}

export const PANEL_ROWS = 7

/** One filter per dim: the same row again removes it, another value replaces it. */
export function toggleFilter(filters: Filter[], dim: Dim, value: string): Filter[] {
  const on = filters.some((f) => f.dim === dim && f.value === value)
  const rest = filters.filter((f) => f.dim !== dim)
  return on ? rest : [...rest, { dim, value }]
}

/** The same query as an API call, with a token placeholder. */
export function curlFor(q: URLSearchParams, dim: Dim, origin: string): string {
  const p = new URLSearchParams(q)
  p.set('dim', dim)
  return `curl -H "Authorization: Bearer $TRAIL_TOKEN" \\\n  "${origin}/api/v1/breakdown?${p}"`
}

/** Start a download of a server attachment without leaving the page. */
function download(href: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function Panel({ id, title, tabs, definition }: PanelProps) {
  const state = useUrlState()
  const { share } = useSite()
  const tz = viewerTz()
  const tab = tabs.find((t) => t.value === state.panels[id]) ?? tabs[0]
  const q = apiQuery(state, tz)
  const qs = q.toString()
  const [hidden, setHidden] = useState<Record<string, string[]>>({})
  const [exitSort, setExitSort] = useState<'exits' | 'rate'>('exits')
  const headingId = `panel-${id}-h`

  const rowsQ = useQuery(`breakdown|${tab?.dim}|${qs}|${state.prefix}`, async (signal) => api.breakdown(q, tab.dim, { limit: 100 }, signal))
  const statsQ = useStats()

  const allCols = tab?.columns ?? []
  const visibleIds = allCols.map((c) => c.id).filter((c) => !(hidden[tab?.value] ?? []).includes(c))
  const cols = allCols.filter((c) => visibleIds.includes(c.id))
  const isExit = tab?.dim === 'exit'
  const barCol = isExit && exitSort === 'rate' ? allCols.find((c) => c.id === 'exitRate') : cols[0]

  const rows = useMemo(() => {
    const r = toRows(rowsQ.data?.rows ?? [], tab.dim, barCol, statsQ.data?.visitors ?? null)
    return isExit && exitSort === 'rate' ? losesMost(r) : r
  }, [rowsQ.data, statsQ.data, tab?.dim, barCol, isExit, exitSort])
  const total = rowsQ.data?.total ?? rows.length
  const shown = rows.slice(0, PANEL_ROWS)
  const overlap = cols.some((c) => c.id === 'share') ? overlapNoteFor(tab.dim, rows) : undefined

  if (!tab) return null
  const setTab = (v: string) => navigate({ panels: { ...state.panels, [id]: v } })
  const openReport = () => navigate({ sheet: { kind: 'report', panel: id, tab: tab.value } })
  const setCol = (cid: string, on: boolean) => {
    const next = toggleColumn(visibleIds, cid, on)
    setHidden((h) => ({ ...h, [tab.value]: allCols.map((c) => c.id).filter((c) => !next.includes(c)) }))
  }
  const exportQ = () => {
    const p = new URLSearchParams(q)
    p.set('dim', tab.dim)
    return p
  }
  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlFor(q, tab.dim, location.origin))
      toast('Copied the API call')
    } catch {
      toast('Could not copy. Your browser blocked the clipboard.', { tone: 'bad' })
    }
  }
  const isActive = (r: BarRowModel) => state.filters.some((f) => f.dim === r.dim && f.value === r.key)

  return (
    <section className="panel" aria-labelledby={headingId} data-panel={id}>
      <div className="panel-h">
        <h2 id={headingId} className={tabs.length > 1 ? 'sr-only' : undefined}>
          {title}
        </h2>
        {tabs.length > 1 && <Tabs value={tab.value} onValueChange={setTab} items={tabs.map((t) => ({ value: t.value, label: t.label }))} ariaLabel={title} />}
        <span className="spacer" />
        <Menu
          label={`${title} options`}
          trigger={
            <button type="button" className="panel-more" aria-label="Panel options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
          }
        >
          <MenuLabel>Columns</MenuLabel>
          {allCols.map((c) => {
            const checked = visibleIds.includes(c.id)
            return (
              <MenuCheckbox key={c.id} checked={checked} disabled={checked && visibleIds.length === 1} onCheckedChange={(on) => setCol(c.id, on)}>
                {c.header}
              </MenuCheckbox>
            )
          })}
          <MenuSeparator />
          <MenuItem onSelect={() => download(api.exportUrl('/breakdown', exportQ(), 'csv'))}>Export CSV</MenuItem>
          <MenuItem onSelect={() => download(api.exportUrl('/breakdown', exportQ(), 'json'))}>Export JSON</MenuItem>
          <MenuItem onSelect={() => void copyCurl()}>Copy as API call</MenuItem>
          <MenuItem onSelect={openReport}>Open full report</MenuItem>
        </Menu>
      </div>
      {(tab.definition ?? definition) && <p className="panel-def">{tab.definition ?? definition}</p>}
      {isExit && (
        <div className="panel-def">
          <Segmented
            value={exitSort}
            onValueChange={(v) => setExitSort(v as 'exits' | 'rate')}
            ariaLabel="Sort exit pages"
            items={[
              { value: 'exits', label: 'Most exits' },
              { value: 'rate', label: 'Loses people most' },
            ]}
          />
        </div>
      )}
      <div className="panel-body" role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={headingId}>
        {rowsQ.error ? (
          <ErrorState onRetry={rowsQ.refetch} />
        ) : rowsQ.loading && !rowsQ.data ? (
          <>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} height={32} />
            ))}
          </>
        ) : shown.length === 0 ? (
          <EmptyState title={emptyTitle(tab.value)} body={emptyBody(tab.value)} />
        ) : (
          <BarList
            rows={shown}
            columns={cols}
            labelHeader={tab.label}
            onOpen={(r) => navigate({ sheet: { kind: 'row', dim: r.dim, key: r.key } })}
            onFilter={share ? undefined : (r) => navigate({ filters: toggleFilter(state.filters, r.dim, r.key) })}
            isActive={isActive}
            overlapNote={overlap}
          />
        )}
      </div>
      <div className="panel-f">
        <button type="button" onClick={openReport}>
          {total > PANEL_ROWS ? `Show all ${total.toLocaleString('en-US')} ${tab.label.toLowerCase()}` : 'Full report'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}

function emptyTitle(tab: string): string {
  if (tab === 'campaigns') return 'No tagged campaigns in this range'
  if (tab === 'ai') return 'No AI referrals in this range'
  if (tab === 'goals') return 'No goals reached in this range'
  return 'Nothing in this range'
}
function emptyBody(tab: string): string {
  if (tab === 'campaigns') return 'Add utm_source, utm_medium and utm_campaign to links you share, and they appear here.'
  if (tab === 'ai') return 'Visits from ChatGPT, Perplexity, Claude, Gemini and Copilot appear here when the assistant sends a referrer.'
  return 'Try a longer range or remove a filter.'
}
