// Activity → Visitors (plan Task F3-3): people seen in the range, server-paged and server-sorted.
import { useState } from 'react'
import { Monitor, Smartphone, Tablet } from 'lucide-react'
import { api } from '../../api/client'
import type { Person } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import LazyTable from './LazyTable'
import type { TableColumn } from '../../data/DataTable'
import { fmtDur, fmtInt } from '../../lib/format'
import { rel } from '../../lib/journey'
import { inWindow } from '../../lib/phrases'
import { navigate } from '../../state/useUrlState'
import { useStats } from '../../shell/useStats'
import { Button } from '../../ui/button'
import { EmptyState } from '../../ui/states'
import { Banner } from './Banner'
import { CountryCode, sourceText, useAq, Who, csvHref } from './shared'

export const PAGE = 50

export function DeviceIcon({ device }: { device: string }) {
  const d = device.toLowerCase()
  const I = d.includes('mobile') || d.includes('phone') ? Smartphone : d.includes('tablet') ? Tablet : Monitor
  return <I aria-hidden="true" size={14} />
}

/** Server sort keys per column; other columns do not sort. */
const SORTS: Record<string, string> = { last: 'last', visits: 'visits', pages: 'pages', time: 'duration' }

export function sortParam(sort: { id: string; desc: boolean } | null, keys: Record<string, string>): string {
  if (!sort || !keys[sort.id]) return ''
  return `${sort.desc ? '-' : ''}${keys[sort.id]}`
}

export function useServerList<T>(name: string, fetch: (q: URLSearchParams, o: { limit: number; sort: string }, sig: AbortSignal) => Promise<{ rows: T[]; total: number }>, defaultSort: string) {
  const { key, q } = useAq()
  const [limit, setLimit] = useState(PAGE)
  const [sort, setSort] = useState(defaultSort)
  const res = useQuery(`${name}|${key}|${limit}|${sort}`, async (sig) => fetch(q, { limit, sort }, sig))
  return { res, limit, setLimit, sort, setSort }
}

export default function Visitors() {
  const { s, q, share } = useAq()
  const stats = useStats()
  const { res, limit, setLimit, setSort } = useServerList<Person>('visitors', (q, o, sig) => api.visitors(q, o, sig), '-last')
  const rows = res.data?.rows ?? []
  const total = res.data?.total ?? 0
  const w = stats.data?.window

  const columns: TableColumn<Person>[] = [
    {
      id: 'who',
      header: 'Visitor',
      enableHiding: false,
      enableSorting: false,
      accessorFn: (p) => p.label,
      cell: (p) => <Who seed={p.person} label={p.label} line={`${sourceText(p.source)}`} />,
    },
    {
      id: 'loc',
      header: 'Location',
      enableSorting: false,
      meta: { hideSm: true },
      accessorFn: (p) => p.city,
      cell: (p) => (
        <span className="inl">
          <CountryCode code={p.country} />
          {p.city || p.country || 'Unknown'}
        </span>
      ),
    },
    {
      id: 'dev',
      header: 'Device',
      enableSorting: false,
      meta: { hideSm: true },
      accessorFn: (p) => p.device,
      cell: (p) => (
        <span className="inl muted">
          <DeviceIcon device={p.device} />
          {[p.browser, p.os].filter(Boolean).join(' · ') || p.device}
        </span>
      ),
    },
    { id: 'visits', header: 'Visits', sortDescFirst: true, meta: { align: 'r' }, accessorFn: (p) => p.visits, cell: (p) => fmtInt(p.visits) },
    { id: 'pages', header: 'Pages', sortDescFirst: true, meta: { align: 'r', hideSm: true }, accessorFn: (p) => p.pages, cell: (p) => fmtInt(p.pages) },
    { id: 'time', header: 'Time', sortDescFirst: true, meta: { align: 'r', hideSm: true }, accessorFn: (p) => p.durationMs, cell: (p) => fmtDur(p.durationMs) },
    { id: 'last', header: 'Last active', sortDescFirst: true, meta: { align: 'r' }, accessorFn: (p) => p.lastSeen, cell: (p) => <span className="muted">{rel(p.lastSeen)}</span> },
  ]

  return (
    <>
      <Banner count={total} filtered={s.filters.length > 0} loading={res.loading && !res.data} noun="visitors" />
      <LazyTable<Person>
        columns={columns}
        data={rows}
        total={total}
        noun="visitors"
        nounOne="visitor"
        caption="Visitors"
        countText={`${fmtInt(total)} ${total === 1 ? 'person' : 'people'} · ${fmtInt(rows.length)} loaded`}
        loading={res.loading && !res.data}
        error={res.data ? null : res.error}
        onRetry={res.refetch}
        manualSorting
        initialSort={{ id: 'last', desc: true }}
        onSortingChange={(x) => setSort(sortParam(x, SORTS) || '-last')}
        getSearchText={(p) => `${p.label} ${p.city} ${p.country} ${p.source} ${p.device} ${p.browser}`}
        getRowLabel={(p) => `Open the journey of ${p.label}`}
        onRowOpen={(p) => navigate({ sheet: { kind: 'journey', person: p.person } })}
        exportHref={csvHref('/visitors', q, share)}
        pageSize={PAGE}
        emptyState={
          <EmptyState
            title={`No visitors ${w ? inWindow(w) : 'in this range'}`}
            body={s.filters.length ? 'Filters at the top also apply. Clear one to see more people.' : 'People show up here as soon as the tracker sends their first page view.'}
          />
        }
        footer={
          rows.length < total ? (
            <div className="foot-row" style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
              <Button size="sm" onClick={() => setLimit(limit + PAGE)} disabled={res.loading}>
                Load {fmtInt(Math.min(PAGE, total - rows.length))} more
              </Button>
            </div>
          ) : null
        }
      />
    </>
  )
}
