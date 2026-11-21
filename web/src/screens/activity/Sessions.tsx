// Activity → Sessions (plan Task F3-3): every visit in the range, server-paged and server-sorted.
import { api } from '../../api/client'
import type { SessionRow } from '../../api/types'
import type { TableColumn } from '../../data/DataTable'
import { fmtDur, fmtInt } from '../../lib/format'
import { inWindow } from '../../lib/phrases'
import { navigate } from '../../state/useUrlState'
import { useStats } from '../../shell/useStats'
import { Button } from '../../ui/button'
import { EmptyState } from '../../ui/states'
import { Banner } from './Banner'
import LazyTable from './LazyTable'
import { CountryCode, dayTime, sourceLabel, Trail, useAq, Who, csvHref } from './shared'
import { PAGE, sortParam, useServerList } from './Visitors'

const SORTS: Record<string, string> = { start: 'start', dur: 'duration', pages: 'pages' }

/** entry → +N → exit, from what the list knows (entry, exit and the page count). */
export function pathSteps(r: Pick<SessionRow, 'entry' | 'exit' | 'pages'>): string[] {
  if (r.pages <= 1 || !r.exit || r.exit === r.entry) return r.pages > 1 && r.exit ? [r.entry, `+${r.pages - 1}`] : [r.entry]
  if (r.pages === 2) return [r.entry, r.exit]
  return [r.entry, `+${r.pages - 2}`, r.exit]
}

export default function Sessions() {
  const { s, q, tz, share } = useAq()
  const stats = useStats()
  const { res, limit, setLimit, setSort } = useServerList<SessionRow>('sessions', (qq, o, sig) => api.sessions(qq, o, sig), '-start')
  const rows = res.data?.rows ?? []
  const total = res.data?.total ?? 0
  const w = stats.data?.window

  const columns: TableColumn<SessionRow>[] = [
    {
      id: 'who',
      header: 'Visitor',
      enableHiding: false,
      enableSorting: false,
      accessorFn: (r) => r.label,
      cell: (r) => (
        <Who
          seed={r.person}
          label={r.label}
          size={20}
          line={
            <span className="inl">
              <CountryCode code={r.country} />
              {r.city || r.country}
            </span>
          }
        />
      ),
    },
    {
      id: 'path',
      header: 'Path',
      enableSorting: false,
      accessorFn: (r) => `${r.entry} ${r.exit}`,
      cell: (r) => <Trail steps={pathSteps(r)} goal={r.goals?.length ? `${r.goals.length === 1 ? 'Goal' : `${r.goals.length} goals`}` : undefined} />,
    },
    { id: 'source', header: 'Source', enableSorting: false, meta: { hideSm: true }, accessorFn: (r) => sourceLabel(r.source) },
    { id: 'pages', header: 'Pages', sortDescFirst: true, meta: { align: 'r', hideSm: true }, accessorFn: (r) => r.pages, cell: (r) => fmtInt(r.pages) },
    { id: 'dur', header: 'Duration', sortDescFirst: true, meta: { align: 'r' }, accessorFn: (r) => r.durationMs, cell: (r) => fmtDur(r.durationMs) },
    { id: 'start', header: 'Started', sortDescFirst: true, meta: { align: 'r' }, accessorFn: (r) => r.start, cell: (r) => <span className="muted">{dayTime(r.start, tz)}</span> },
  ]

  return (
    <>
      <Banner count={total} filtered={s.filters.length > 0} loading={res.loading && !res.data} noun="sessions" of="sessions" />
      <LazyTable<SessionRow>
        columns={columns}
        data={rows}
        total={total}
        noun="sessions"
        nounOne="session"
        caption="Sessions"
        countText={`${fmtInt(total)} ${total === 1 ? 'session' : 'sessions'} · ${fmtInt(rows.length)} loaded`}
        loading={res.loading && !res.data}
        error={res.data ? null : res.error}
        onRetry={res.refetch}
        manualSorting
        initialSort={{ id: 'start', desc: true }}
        onSortingChange={(x) => setSort(sortParam(x, SORTS) || '-start')}
        pageSize={PAGE}
        getSearchText={(r) => `${r.label} ${r.entry} ${r.exit} ${r.source} ${r.city}`}
        getRowLabel={(r) => `Open this session in the journey of ${r.label}`}
        onRowOpen={(r) => navigate({ sheet: { kind: 'journey', person: r.person, session: r.sessionId } })}
        exportHref={csvHref('/sessions', q, share)}
        emptyState={
          <EmptyState
            title={`No sessions ${w ? inWindow(w) : 'in this range'}`}
            body={s.filters.length ? 'Filters at the top also apply. Clear one to see more visits.' : 'A session starts with the first page view of a visit.'}
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
