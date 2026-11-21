// The event sheet (plan Task F3-4, `evn=`): stats vs the basis, a trend with the previous period, a
// breakdown per property and the 15 latest occurrences. Each occurrence opens that visit's journey (and so
// replaces `evn`, since the URL holds one sheet).
import { ChevronRight, Funnel } from 'lucide-react'
import { api } from '../api/client'
import type { EventDetail } from '../api/types'
import { useQuery } from '../api/useQuery'
import { LineChart } from '../charts/LineChart'
import { BarList, type BarRowModel, type ColumnDef } from '../data/BarList'
import { fmtInt, fmtPct } from '../lib/format'
import { rel } from '../lib/journey'
import { inWindow } from '../lib/phrases'
import { dayTime, StatStrip, useAq } from '../screens/activity/shared'
import { navigate } from '../state/useUrlState'
import { useStats } from '../shell/useStats'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { DeltaPill } from '../ui/delta-pill'
import { Sheet } from '../ui/dialog'
import { Chip } from '../ui/small'
import { EmptyState, ErrorState, Skeleton } from '../ui/states'
import '../screens/activity/activity.css'

export function EventSheet() {
  const { s, share } = useAq()
  const sheet = s.sheet?.kind === 'event' ? s.sheet : null
  const name = sheet?.name ?? ''
  const filterOn = s.filters.some((f) => f.dim === 'event' && f.value === name)
  return (
    <Sheet
      open={!!sheet}
      onOpenChange={(o) => !o && navigate({ sheet: null })}
      title={name || 'Event'}
      size="wide"
      actions={
        sheet && !share && !filterOn ? (
          <Button size="sm" onClick={() => navigate({ filters: [...s.filters.filter((f) => f.dim !== 'event'), { dim: 'event', value: name }], sheet: null })}>
            <Funnel aria-hidden="true" size={14} />
            Filter dashboard
          </Button>
        ) : null
      }
    >
      {sheet && <EventBody name={name} />}
    </Sheet>
  )
}

const COUNT_COL: ColumnDef[] = [
  { id: 'count', header: 'Count', value: (r) => r.value },
  { id: 'share', header: '% of total', value: (r) => r.share ?? null, format: (v) => fmtPct(v), muted: true },
]

export function EventBody({ name }: { name: string }) {
  const { q, key, tz } = useAq()
  const stats = useStats()
  const d = useQuery<EventDetail>(`event-detail|${key}|${name}`, async (sig) => api.eventDetail(q, name, sig))
  const w = stats.data?.window

  if (d.error && !d.data) return <ErrorState onRetry={d.refetch} />
  if (d.loading && !d.data) {
    return (
      <div aria-busy="true">
        <Skeleton height={90} />
        <div style={{ height: 12 }} />
        <Skeleton height={200} />
      </div>
    )
  }
  const e = d.data
  if (!e || e.count === 0) {
    return <EmptyState title={`No “${name}” events ${w ? inWindow(w) : 'in this range'}`} body="Try a longer range or remove a filter." />
  }
  const last = e.latest[0]?.ts ?? null
  const perPerson = e.people ? e.count / e.people : 0
  const basis = w?.basis

  return (
    <>
      <p className="evs-head">
        {e.name === 'Outbound link' ? 'Outbound click, recorded automatically' : 'Custom event'} · {w?.label ?? ''} · {tz.split('/').pop()?.replace(/_/g, ' ')} time
      </p>
      <StatStrip
        items={[
          {
            k: 'Count',
            v: fmtInt(e.count),
            s:
              e.prev && basis && !basis.none ? (
                <>
                  <DeltaPill cur={e.count} prev={e.prev.count} kind="count" goodWhen="flat" basis={basis} n={e.prev.count} /> vs {fmtInt(e.prev.count)}
                </>
              ) : (
                'times it fired'
              ),
          },
          {
            k: 'People',
            v: fmtInt(e.people),
            s: e.prev && basis && !basis.none ? <DeltaPill cur={e.people} prev={e.prev.people} kind="count" goodWhen="flat" basis={basis} n={e.prev.people} /> : `${perPerson.toFixed(1)} per person`,
          },
          { k: 'Last seen', v: last ? rel(last) : '–', s: last ? dayTime(last, tz) : undefined },
          { k: 'Properties', v: fmtInt(e.props.length), s: e.props.map((p) => p.key).join(', ') || 'none sent' },
        ]}
      />
      {w && e.series.length > 0 && (
        <figure className="evs-chart" aria-label={`${e.name} per ${w.bucket}`}>
          <div className="ro">
            <b>{fmtInt(e.count)}</b>
            <span className="muted">
              {e.name} per {w.bucket}
              {e.prevSeries.length ? ', previous period dashed' : ''}
            </span>
          </div>
          <LineChart points={e.series} prev={e.prevSeries.length ? e.prevSeries : undefined} window={w} color="var(--chart-1)" height={160} ariaLabel={`${e.name} per ${w.bucket}`} kind="count" />
        </figure>
      )}
      {e.props.length > 0 && (
        <div className="evs-props">
          {e.props.map((p) => {
            const rows: BarRowModel[] = p.rows.slice(0, 6).map((r) => ({
              key: r.value,
              label: r.value,
              value: r.count,
              dim: 'event',
              row: { key: r.value, visitors: r.people, pageviews: r.count, total: r.count },
              share: e.count ? r.count / e.count : null,
            }))
            return (
              <section key={p.key} className="panel" aria-label={`Property ${p.key}`}>
                <div className="panel-h">
                  <h2>
                    <span className="muted">property</span> {p.key}
                  </h2>
                  <span className="spacer" />
                  <span className="muted" style={{ fontSize: 'var(--text-caption)', paddingRight: 8 }}>
                    {fmtInt(p.rows.length)} {p.rows.length === 1 ? 'value' : 'values'}
                  </span>
                </div>
                <div className="panel-body">
                  <BarList rows={rows} columns={COUNT_COL} labelHeader="Value" />
                </div>
              </section>
            )
          })}
        </div>
      )}
      <div className="sec-h">
        <h3>Recent occurrences</h3>
        <p>Newest first. Each one opens the journey around it.</p>
      </div>
      <div className="occ-list">
        {e.latest.slice(0, 15).map((o, i) => (
          <button
            key={`${o.ts}-${i}`}
            type="button"
            className="occ"
            onClick={() => navigate({ sheet: { kind: 'journey', person: o.person, session: o.sessionId } })}
          >
            <Avatar seed={o.person} size={20} />
            <span className="who">
              <b data-testid="journey-label">{o.label}</b>{' '}
              <span>{dayTime(o.ts, tz)}</span>{' '}
            </span>
            <span className="prop-chips">
              {Object.entries(o.props ?? {})
                .slice(0, 2)
                .map(([k, v]) => (
                  <Chip key={k} k={k} v={String(v)} />
                ))}
            </span>
            <span className="when">
              {' '}
              {rel(o.ts)} <ChevronRight aria-hidden="true" size={14} style={{ verticalAlign: 'middle' }} />
            </span>
            <span className="sr-only">. Open the journey</span>
          </button>
        ))}
      </div>
      {e.count > 15 && <p className="method">Showing the latest 15 of {fmtInt(e.count)}. Filter the dashboard to this event to see everyone in Activity.</p>}
    </>
  )
}
