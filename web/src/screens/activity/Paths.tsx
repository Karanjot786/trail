// Activity → Paths (plan Task F3-5): how people reached a goal, as a ranked list (no Sankey).
import { useState } from 'react'
import { api } from '../../api/client'
import type { GoalDetail, PathsReport } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import { bar } from '../../lib/bar'
import { fmtInt, fmtPct } from '../../lib/format'
import { inWindow } from '../../lib/phrases'
import { RouteLink } from '../../shell/RouteLink'
import { useStats } from '../../shell/useStats'
import { Segmented } from '../../ui/tabs'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { StatStrip, Trail, useAq } from './shared'

export default function Paths() {
  const { s, q, key, share } = useAq()
  const stats = useStats()
  const goals = useQuery(`goals|${s.site}`, async (sig) => api.goals(s.site, sig), { enabled: !!s.site && s.site !== 'all', staleMs: 60_000 })
  const [picked, setPicked] = useState<number | null>(null)
  const list = goals.data ?? []
  const conv = stats.data?.conv?.goalId
  const goalId = picked ?? (list.some((g) => g.id === conv) ? conv! : (list[0]?.id ?? null))
  const enabled = goalId != null
  const paths = useQuery<PathsReport>(`paths|${key}|${goalId}`, async (sig) => api.paths(q, goalId!, sig), { enabled })
  const detail = useQuery<GoalDetail>(`goal-detail|${key}|${goalId}`, async (sig) => api.goalDetail(q, goalId!, sig), { enabled })
  const w = stats.data?.window

  if (goals.loading && !goals.data) return <Skeleton height={200} />
  if (goals.error && !goals.data) return <ErrorState onRetry={goals.refetch} />
  if (!list.length) {
    return (
      <div className="panel">
        <EmptyState
          title="Paths need a goal"
          body="This site has no goals yet. Add one (a page like /pricing or an event like Signup) and Trail shows the routes people took to reach it."
          action={
            share ? undefined : (
              <RouteLink className="btn btn-sm btn-primary" patch={{ screen: 'conversions', tab: 'goals', id: null, sheet: null }}>
                Go to Conversions
              </RouteLink>
            )
          }
        />
      </div>
    )
  }

  const goal = list.find((g) => g.id === goalId) ?? list[0]
  const rows = paths.data?.rows ?? []
  const max = rows.reduce((m, r) => Math.max(m, r.people), 0)
  const bv = detail.data?.byVisit
  const bvTotal = bv ? bv.first + bv.second + bv.later : 0
  const converters = paths.data?.converters ?? 0

  return (
    <>
      <h2 className="sr-only">Paths to {goal.name}</h2>
      <div className="paths-top">
        <Segmented
          ariaLabel="Goal"
          value={String(goal.id)}
          onValueChange={(v) => setPicked(Number(v))}
          items={list.map((g) => ({ value: String(g.id), label: g.name }))}
        />
        <span className="muted" style={{ fontSize: 'var(--text-small)' }}>
          {fmtInt(converters)} {converters === 1 ? 'person' : 'people'} reached {goal.name} {w ? inWindow(w) : ''}.
        </span>
      </div>
      <StatStrip
        cols={3}
        items={[
          { k: 'Converted on visit 1', v: bv ? fmtPct(bvTotal ? bv.first / bvTotal : 0) : '–', s: bv ? `${fmtInt(bv.first)} ${bv.first === 1 ? 'person' : 'people'}` : undefined },
          { k: 'Converted on visit 2', v: bv ? fmtPct(bvTotal ? bv.second / bvTotal : 0) : '–', s: bv ? `${fmtInt(bv.second)} ${bv.second === 1 ? 'person' : 'people'}` : undefined },
          { k: 'Converted later', v: bv ? fmtPct(bvTotal ? bv.later / bvTotal : 0) : '–', s: bv ? `${fmtInt(bv.later)} ${bv.later === 1 ? 'person' : 'people'}, on visit 3 or after` : undefined },
        ]}
      />
      <section className="panel" aria-labelledby="paths-h">
        <div className="panel-h">
          <h2 id="paths-h">Paths that lead to {goal.name}</h2>
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 'var(--text-caption)', paddingRight: 8 }}>
            Source, then pages, within the converting visit
          </span>
        </div>
        {paths.error && !paths.data ? (
          <ErrorState onRetry={paths.refetch} />
        ) : paths.loading && !paths.data ? (
          <div style={{ padding: 12 }}>
            <Skeleton height={120} />
          </div>
        ) : rows.length ? (
          <ol className="paths-list" aria-label={`Paths to ${goal.name}, most people first`}>
            {rows.map((r, i) => (
              <li key={i} className="path-row" data-testid="path-row">
                <Trail steps={r.steps} goal={goal.name} first="src" />
                <span className="hbar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${bar(r.people, max)})` }} />
                </span>
                <span className="c">
                  <b>{fmtInt(r.people)}</b> <span className="sr-only">{r.people === 1 ? 'person' : 'people'}</span>
                </span>
                <span className="c dim">{fmtPct(r.share)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title={`No one reached ${goal.name} ${w ? inWindow(w) : 'in this range'}`} body="Widen the range or remove a filter." />
        )}
        <p className="panel-def">
          Paths are grouped by source and the sequence of pages before the goal in the same visit. Long paths keep their first and last two pages. A Sankey would be harder to read past four steps,
          so this is a ranked list.
        </p>
      </section>
    </>
  )
}
