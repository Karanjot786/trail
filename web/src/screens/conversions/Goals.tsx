// Conversions → Goals (Task F4-2): one card per goal with its rate, the delta (n = the earlier period's base
// visitors), a 7-point spark and its counts. A goal filter is ignored here so rates stay meaningful.
import { useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { api } from '../../api/client'
import type { Basis, GoalRow } from '../../api/types'
import { Sparkline } from '../../charts/Sparkline'
import { fmtInt, fmtPct } from '../../lib/format'
import { inWindow } from '../../lib/phrases'
import { RouteLink } from '../../shell/RouteLink'
import { useStats } from '../../shell/useStats'
import { DeltaPill } from '../../ui/delta-pill'
import { Badge } from '../../ui/small'
import { Button } from '../../ui/button'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { GoalDialog } from './GoalDialog'
import { Method, useReport } from './kit'

/** Base visitors behind a rate (converters ÷ rate); 0 when nobody converted. */
export const baseOf = (s: { visitors: number; rate: number }) => (s.rate > 0 ? Math.round(s.visitors / s.rate) : 0)

function GoalCard({ g, basis, cmp }: { g: GoalRow; basis: Basis | null; cmp: boolean }) {
  const d = useReport(`goal:${g.id}`, (q, sig) => api.goalDetail(q, g.id, sig), { dropGoal: true })
  const spark = (d.data?.series ?? []).map((p) => p.v).slice(-7)
  return (
    <RouteLink className="gcard" patch={{ screen: 'conversions', tab: 'goals', id: g.id, sheet: null }} aria-label={`${g.name}: ${fmtPct(g.rate)} conversion rate, ${fmtInt(g.visitors)} converted`}>
      <span className="h">
        <span className="goal-ring" aria-hidden="true" />
        <b>{g.name}</b>
        <span className="chip">
          <span className="k">{g.kind}</span>
          <span className={g.kind === 'page' ? 'v mono' : 'v'}>{g.match}</span>
        </span>
        <ChevronRight size={16} aria-hidden="true" className="end" />
      </span>
      <span className="m">
        <span>
          <span className="rate-big">{fmtPct(g.rate)}</span>
          <span className="rate-sub">
            conversion rate
            {cmp && basis && <DeltaPill cur={g.rate} prev={g.prev?.rate ?? null} kind="rate" goodWhen="up" basis={basis} n={baseOf(g.prev ?? { visitors: 0, rate: 0 })} />}
          </span>
        </span>
        {spark.length > 1 && <Sparkline values={spark} width={150} height={44} color="var(--goal)" area className="spark" />}
      </span>
      <span className="nums">
        <span>
          <span className="k">Completions</span>
          <span className="v">{fmtInt(g.conversions)}</span>
        </span>
        <span>
          <span className="k">Converted</span>
          <span className="v">{fmtInt(g.visitors)}</span>
        </span>
        <span>
          <span className="k">Of visitors</span>
          <span className="v">{fmtInt(baseOf(g))}</span>
        </span>
      </span>
    </RouteLink>
  )
}

export function Goals({ share }: { share: boolean }) {
  const r = useReport('goals-report', (q, sig) => api.goalsReport(q, sig), { dropGoal: true })
  const stats = useStats()
  const [adding, setAdding] = useState(false)
  const s = r.s
  const goals = r.data ?? []
  const basis = stats.data?.window?.basis ?? null
  const goalFiltered = s.filters.some((f) => f.dim === 'goal')

  if (r.error && !r.data) return <ErrorState onRetry={r.refetch} />
  if (!r.data)
    return (
      <div className="goal-cards" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="gcard">
            <Skeleton height={14} width="40%" />
            <Skeleton height={36} width="30%" />
            <Skeleton height={14} />
          </div>
        ))}
      </div>
    )
  return (
    <>
      {goals.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No goals for this website yet"
            body="A goal turns a page or an event into a number you can watch: “visited /pricing” or “sent Signup”. Trail then shows the rate, its trend and the paths that lead to it."
            action={
              !share && (
                <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
                  <Plus size={14} aria-hidden="true" />
                  Add a goal
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="goal-cards">
          {goals.map((g) => (
            <GoalCard key={g.id} g={g} basis={basis} cmp={s.cmp !== 'none' && !!basis && !basis.none} />
          ))}
          {!share && (
            <button type="button" className="gcard add" onClick={() => setAdding(true)}>
              <Plus size={16} aria-hidden="true" />
              <b>Add a goal</b>
              <span>A page, a path prefix like /docs/*, or a custom event.</span>
            </button>
          )}
        </div>
      )}
      <Method>
        Rates are people who reached the goal {inWindow({ key: s.range })}, of everyone who visited.
        {goalFiltered && (
          <>
            {' '}
            <Badge>goal filter ignored</Badge> so rates stay meaningful.
          </>
        )}
      </Method>
      {!share && <GoalDialog open={adding} onOpenChange={setAdding} site={s.site} />}
    </>
  )
}
