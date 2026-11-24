// The drop-off sheet (Task F4-4, `?fd=funnel:step`): every person who reached step N and never step N+1,
// newest last visit first. CSV export, a copyable link, and each person opens their journey (Back returns here).
// A link to a funnel that no longer exists keeps the sheet closed; the Funnels screen says so in the page.
import { Download, Link2 } from 'lucide-react'
import { api } from '../api/client'
import type { DropoffPerson } from '../api/types'
import { useQuery } from '../api/useQuery'
import { rowLabel } from '../data/columns'
import { fmtInt } from '../lib/format'
import { apiQuery } from '../state/url'
import { navigate, useUrlState } from '../state/useUrlState'
import { useReportTz } from '../shell/useReportTz'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { Sheet } from '../ui/dialog'
import { EmptyState, ErrorState, Skeleton } from '../ui/states'
import { toast } from '../ui/toast'
import LazyTable from '../screens/activity/LazyTable'
import '../screens/conversions/kit.css'

const when = (ms: number, tz: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(ms)
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
  }
}

/** Starts a download of `href` from a button (the export is an attachment). */
function download(href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = ''
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function DropoffSheet() {
  const s = useUrlState()
  const sheet = s.sheet?.kind === 'dropoff' ? s.sheet : null
  const tz = useReportTz()
  const q = apiQuery(s)
  const key = sheet ? `${sheet.funnel}:${sheet.step}` : ''
  const share = s.prefix.startsWith('/share/')
  const rep = useQuery(`f4|funnel:${sheet?.funnel}|${q}|${s.prefix}`, (sig) => api.funnelReport(q, sheet!.funnel, sig), { enabled: !!sheet, keepPrevious: false })
  const list = useQuery(`f4|dropoff:${key}|${q}|${s.prefix}`, (sig) => api.funnelDropoff(q, sheet!.funnel, sheet!.step, { limit: 1000 }, sig), { enabled: !!sheet, keepPrevious: false })

  const stale = rep.error && 'status' in rep.error && (rep.error as { status: number }).status === 404
  const r = rep.data
  const n = sheet?.step ?? 0
  const st = r?.steps[n - 1]
  const next = r?.steps[n]
  const total = list.data?.total ?? st?.leftAfter ?? 0
  const title = stale ? 'Funnel not found' : `Left after step ${n}`
  const exportQ = new URLSearchParams(q)
  exportQ.set('step', String(n))

  let body
  if (!sheet) body = null
  else if (stale || (r && !st))
    body = (
      <EmptyState
        title={stale ? 'This funnel no longer exists' : `Step ${n} no longer exists in this funnel`}
        body="It may have been deleted or edited since the link was made."
        action={
          <Button size="sm" onClick={() => navigate({ sheet: null })}>
            Close
          </Button>
        }
      />
    )
  else if ((rep.error && !r) || (list.error && !list.data)) body = <ErrorState onRetry={() => (rep.refetch(), list.refetch())} />
  else if (!r || !list.data) body = <Skeleton height={240} />
  else
    body = (
      <>
        <div className="drop-head">
          <p className="m-0">
            <b className="tabular-nums">
              {fmtInt(total)} {total === 1 ? 'person' : 'people'} left after step {n}
            </b>
            <span className="muted">
              {' '}
              of {r.funnel.name}: reached {st!.label}, never {next?.label ?? 'the next step'}, within the funnel window · {r.window.label}.
            </span>
          </p>
          <div className="acts">
            {!share && (
              <Button size="sm" onClick={() => download(api.exportUrl(`/funnels/${r.funnel.id}/dropoff`, exportQ, 'csv'))}>
                <Download size={14} aria-hidden="true" />
                Export CSV
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(location.href).catch(() => undefined)
                toast('Link to this list copied', { tone: 'good' })
              }}
            >
              <Link2 size={14} aria-hidden="true" />
              Copy link
            </Button>
          </div>
        </div>
        <LazyTable<DropoffPerson>
          noun="people"
          nounOne="person"
          caption={`People who left after step ${n}, newest first`}
          data={list.data.rows}
          total={list.data.total}
          initialSort={{ id: 'last', desc: true }}
          getSearchText={(p) => `${p.label} ${p.exitPage} ${p.source}`}
          onRowOpen={(p) => navigate({ sheet: { kind: 'journey', person: p.person } })}
          emptyState={<EmptyState title="Nobody left after this step" body="Everyone who reached it went on to the next one." />}
          columns={[
            {
              id: 'who',
              header: 'Person',
              enableHiding: false,
              accessorFn: (p) => p.label,
              cell: (p) => (
                <span className="who">
                  <Avatar seed={p.person} size={28} />
                  <span className="nm">
                    <b>{p.label}</b>
                  </span>
                </span>
              ),
            },
            { id: 'last', header: 'Last visit in range', accessorFn: (p) => p.lastVisit, meta: { align: 'r' }, cell: (p) => <span className="muted">{when(p.lastVisit, tz)}</span> },
            { id: 'exit', header: 'Left from', accessorFn: (p) => p.exitPage, meta: { hideSm: true }, cell: (p) => <span className="mono">{p.exitPage}</span> },
            { id: 'src', header: 'Came from', accessorFn: (p) => p.source, meta: { hideSm: true }, cell: (p) => rowLabel('source', p.source) },
          ]}
        />
      </>
    )

  return (
    <Sheet open={!!sheet && !stale} onOpenChange={(o) => !o && navigate({ sheet: null })} title={title}>
      {body}
    </Sheet>
  )
}
