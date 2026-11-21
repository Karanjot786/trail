// The KPI strip (Task F2-3): a tablist "Metrics" of up to 7 tiles. Each tab is named
// "{Label}, {value}, {delta sr}"; the hint reads "vs {prev value}" and wraps instead of truncating.
// Selecting a tile puts that metric on the chart (metric= in the URL). Keys 1–7 are bound by the shell.
import { useRef, type KeyboardEvent } from 'react'
import type { Basis, Metric, Stats } from '../../api/types'
import { Sparkline } from '../../charts/Sparkline'
import { compare, deltaLabel } from '../../lib/compare'
import { navigate, useUrlState } from '../../state/useUrlState'
import { setActor } from '../../shell/FilterBar'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { DeltaKind } from '../../lib/compare'
import { fmtMetric, metricDefs, type MetricDef } from './metrics'
import { useSeries } from './useOverviewData'

export interface KpiStripProps {
  stats: Stats
  metrics: Metric[]
  active: Metric
  currency: string
  compareOn: boolean
}

/**
 * The accessible name of a tile: "{Label} {value} {pill} vs {prev}, {delta sr}". It starts with the visible
 * text in reading order (WCAG 2.5.3), then says what the change is compared with.
 */
export function kpiName(def: MetricDef, stats: Stats, basis: Basis, compareOn: boolean, currency: string): string {
  const v = def.value(stats)
  const text = fmtMetric(def, v, currency)
  if (v == null) return `${def.label} n/a No goal yet, no goal on this site yet`
  if (!compareOn || !stats.prev) return `${def.label} ${text} ${basis.none ? `${stats.window.label}, no comparison` : 'No earlier data'}`
  const pv = def.value(stats.prev)
  const d = compare(v, pv, def.kind, def.goodWhen, def.n?.(stats.prev))
  const l = deltaLabel(d, basis)
  return `${def.label} ${text} ${l.pill} vs ${fmtMetric(def, pv, currency)}, ${l.sr}`
}

export function KpiStrip({ stats, metrics, active, currency, compareOn }: KpiStripProps) {
  const defs = metricDefs(stats)
  const basis = stats.window.basis
  const ref = useRef<HTMLDivElement>(null)
  const onKey = (e: KeyboardEvent) => {
    const i = metrics.indexOf(active)
    let n = -1
    if (e.key === 'ArrowRight') n = (i + 1) % metrics.length
    else if (e.key === 'ArrowLeft') n = (i - 1 + metrics.length) % metrics.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = metrics.length - 1
    if (n < 0) return
    e.preventDefault()
    navigate({ metric: metrics[n] }, { replace: true })
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[n]?.focus()
  }
  return (
    <>
      <AgentNote n={stats.agentSessions ?? 0} />
      <div ref={ref} className="kpis" role="tablist" aria-label="Metrics" data-n={metrics.length} onKeyDown={onKey}>
        {metrics.map((m) => (
          <KpiTile key={m} def={defs[m]} stats={stats} basis={basis} on={m === active} currency={currency} compareOn={compareOn} />
        ))}
      </div>
    </>
  )
}

/** Plan F-5: AI agents are left out of people metrics by default; say how many, and offer the other scope. */
export function AgentNote({ n }: { n: number }) {
  const { actor, prefix } = useUrlState()
  if (!(n > 0) || prefix.startsWith('/share/')) return null
  const all = actor === 'all'
  const sessions = `${n.toLocaleString('en-US')} AI agent ${n === 1 ? 'session' : 'sessions'}`
  return (
    <p className="kpi-note m-0 mb-2 flex flex-wrap items-center justify-end gap-x-2 text-caption text-muted" data-testid="agent-note">
      <span>{all ? `Includes ${sessions}` : `${sessions} left out`}</span>
      <button type="button" className="cursor-pointer underline decoration-dotted underline-offset-[3px] hover:text-fg pointer-coarse:min-h-11" onClick={() => setActor(!all)}>
        {all ? 'Leave them out' : 'Count them as visitors'}
      </button>
    </p>
  )
}

function KpiTile({ def, stats, basis, on, currency, compareOn }: { def: MetricDef; stats: Stats; basis: Basis; on: boolean; currency: string; compareOn: boolean }) {
  const v = def.value(stats)
  const prev = stats.prev ? def.value(stats.prev) : null
  const showDelta = compareOn && !!stats.prev && v != null
  const series = useSeries(def.key)
  const last = stats.window.lastBucket
  const spark = (series.data?.points ?? []).slice(0, last + 1).map((p) => p.v)
  return (
    <button
      type="button"
      role="tab"
      className="kpi"
      aria-selected={on}
      tabIndex={on ? 0 : -1}
      aria-describedby={`kpi-d-${def.key}`}
      onClick={() => navigate({ metric: def.key }, { replace: true })}
    >
      <span className="lbl">{def.label}</span>{' '}
      <span className="val" data-kpi-value="">
        {fmtMetric(def, v, currency)}
      </span>{' '}
      <span className="row2">
        {showDelta && <StaticDelta cur={v} prev={prev} kind={def.kind} goodWhen={def.goodWhen} basis={basis} n={stats.prev ? def.n?.(stats.prev) : undefined} spoken />}{' '}
        <span className="hint">
          {v == null ? 'No goal yet' : showDelta ? `vs ${fmtMetric(def, prev, currency)}` : basis.none ? stats.window.label : 'No earlier data'}
        </span>
      </span>
      <span id={`kpi-d-${def.key}`} hidden>
        {kpiName(def, stats, basis, compareOn, currency)}
      </span>
      {spark.length > 1 && <Sparkline values={spark} width={120} height={20} color={on ? def.color : 'var(--chart-prev)'} className="spark" />}
    </button>
  )
}

/**
 * The same pill as DeltaPill (compare + deltaLabel), without its focusable tooltip: a tab cannot hold
 * another focus stop. The tab's accessible name carries the full sentence, and `title` the basis.
 */
export function StaticDelta(p: { cur: number | null; prev: number | null; kind: DeltaKind; goodWhen: 'up' | 'down' | 'flat'; basis: Basis; n?: number; spoken?: boolean }) {
  const d = compare(p.cur, p.prev, p.kind, p.goodWhen, p.n)
  const l = deltaLabel(d, p.basis)
  const Arrow = d.up == null ? null : d.up ? ArrowUp : ArrowDown
  return (
    <span className="delta" data-mode={d.mode} data-tone={d.tone} title={l.tip} aria-hidden={p.spoken ? undefined : true}>
      {Arrow && <Arrow aria-hidden="true" />}
      <span>{l.pill}</span>
    </span>
  )
}
