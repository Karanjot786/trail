// Activity → Events (plan Task F3-4): the event catalogue. One row per event name; a row opens the event sheet.
import { ExternalLink, Zap } from 'lucide-react'
import { api } from '../../api/client'
import type { EventRow, Goal } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import type { TableColumn } from '../../data/DataTable'
import { fmtInt } from '../../lib/format'
import { rel } from '../../lib/journey'
import { inWindow } from '../../lib/phrases'
import { navigate } from '../../state/useUrlState'
import { useStats } from '../../shell/useStats'
import { Badge, Chip } from '../../ui/small'
import { EmptyState } from '../../ui/states'
import LazyTable from './LazyTable'
import { StatStrip, useAq, csvHref } from './shared'

export function EventIcon({ kind, name }: { kind?: EventRow['kind']; name: string }) {
  return kind === 'outbound' || name === 'Outbound link' ? <ExternalLink aria-hidden="true" size={14} /> : <Zap aria-hidden="true" size={14} />
}

export function goalNames(goals: Goal[] | undefined): Set<string> {
  return new Set((goals ?? []).filter((g) => g.kind === 'event').map((g) => g.match))
}

export default function Events() {
  const { s, q, key, share } = useAq()
  const stats = useStats()
  const res = useQuery(`events|${key}`, async (sig) => api.events(q, { limit: 1000 }, sig))
  const goals = useQuery(`goals|${s.site}`, async (sig) => api.goals(s.site, sig), { enabled: !!s.site && !share && s.site !== 'all', staleMs: 60_000 })
  const rows = res.data?.rows ?? []
  const isGoal = goalNames(goals.data)
  const w = stats.data?.window
  const occurrences = rows.reduce((a, r) => a + r.count, 0)

  const columns: TableColumn<EventRow>[] = [
    {
      id: 'name',
      header: 'Event',
      enableHiding: false,
      accessorFn: (e) => e.name,
      cell: (e) => (
        <span className="cellname">
          <EventIcon kind={e.kind} name={e.name} />
          <b>{e.name}</b>
          {isGoal.has(e.name) && <Badge tone="goal">goal</Badge>}
        </span>
      ),
    },
    { id: 'count', header: 'Count', sortDescFirst: true, meta: { align: 'r' }, accessorFn: (e) => e.count, cell: (e) => fmtInt(e.count) },
    { id: 'people', header: 'People', sortDescFirst: true, meta: { align: 'r' }, accessorFn: (e) => e.people, cell: (e) => fmtInt(e.people) },
    { id: 'last', header: 'Last seen', sortDescFirst: true, meta: { align: 'r', hideSm: true }, accessorFn: (e) => e.lastSeen, cell: (e) => <span className="muted">{rel(e.lastSeen)}</span> },
    {
      id: 'props',
      header: 'Properties',
      enableSorting: false,
      meta: { hideSm: true },
      accessorFn: (e) => (e.props ?? []).map((p) => p.key).join(' '),
      cell: (e) =>
        e.props?.length ? (
          <span className="prop-chips">
            {e.props.map((p) => (
              <Chip key={p.key} k={p.key} v={fmtInt(p.distinct)} />
            ))}
          </span>
        ) : (
          <span className="subtle">none</span>
        ),
    },
  ]

  return (
    <>
      <StatStrip
        cols={3}
        items={[
          { k: 'Events tracked', v: fmtInt(rows.length), s: `distinct names ${w ? inWindow(w) : ''}`.trim(), testId: 'events-n' },
          { k: 'Occurrences', v: fmtInt(occurrences), s: 'every time one fired' },
          { k: 'Goals among them', v: fmtInt(rows.filter((r) => isGoal.has(r.name)).length), s: 'events that count as a goal' },
        ]}
      />
      <LazyTable<EventRow>
        columns={columns}
        data={rows}
        noun="events"
        nounOne="event"
        caption="Event catalogue"
        initialSort={{ id: 'count', desc: true }}
        loading={res.loading && !res.data}
        error={res.data ? null : res.error}
        onRetry={res.refetch}
        getSearchText={(e) => `${e.name} ${(e.props ?? []).map((p) => p.key).join(' ')}`}
        getRowLabel={(e) => `${e.name}: ${fmtInt(e.count)} times, ${fmtInt(e.people)} people`}
        onRowOpen={(e) => navigate({ sheet: { kind: 'event', name: e.name } })}
        exportHref={csvHref('/events', q, share)}
        emptyState={
          <EmptyState
            title={`No custom events ${w ? inWindow(w) : 'in this range'}`}
            body={
              <>
                Send one with <code className="mono">trail.track("Signup", {'{ plan: "free" }'})</code>. It shows up here within seconds, with its properties.
              </>
            }
          />
        }
      />
      <p className="method">
        Property chips show each key and how many distinct values it had. Outbound clicks are recorded automatically; every other event comes from{' '}
        <code className="mono">trail.track()</code>.
      </p>
    </>
  )
}
