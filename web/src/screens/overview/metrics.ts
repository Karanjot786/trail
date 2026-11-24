// The seven Overview metrics: label, how a value reads, which way is good, and the base `n` behind a
// rate or average (compare() says "too little data" under 5). Colour follows the entity.
import type { Metric, Stats, Totals } from '../../api/types'
import { dayIso, fmtDur, fmtInt, fmtMoney, fmtPct } from '../../lib/format'

export { dayIso }
import type { DeltaKind } from '../../lib/compare'

export interface MetricDef {
  key: Metric
  label: string
  kind: DeltaKind
  goodWhen: 'up' | 'down'
  color: string
  value: (t: Totals) => number | null
  /** The size of the earlier period behind a rate, an average or money; undefined for counts. */
  n?: (prev: Totals) => number
}

export const METRIC_ORDER: Metric[] = ['visitors', 'pageviews', 'sessions', 'duration', 'bounce', 'conversion', 'revenue']

export function metricDefs(stats: Pick<Stats, 'conv'> | null | undefined): Record<Metric, MetricDef> {
  const goal = stats?.conv?.name
  return {
    visitors: { key: 'visitors', label: 'Visitors', kind: 'count', goodWhen: 'up', color: 'var(--chart-1)', value: (t) => t.visitors },
    pageviews: { key: 'pageviews', label: 'Page views', kind: 'count', goodWhen: 'up', color: 'var(--chart-2)', value: (t) => t.pageviews },
    sessions: { key: 'sessions', label: 'Sessions', kind: 'count', goodWhen: 'up', color: 'var(--chart-3)', value: (t) => t.sessions },
    duration: { key: 'duration', label: 'Avg. session', kind: 'duration', goodWhen: 'up', color: 'var(--chart-1)', value: (t) => t.durationMs, n: (p) => p.sessions },
    bounce: { key: 'bounce', label: 'Bounce rate', kind: 'rate', goodWhen: 'down', color: 'var(--chart-1)', value: (t) => t.bounce, n: (p) => p.sessions },
    conversion: {
      key: 'conversion',
      label: goal ? `${goal} rate` : 'Goal rate',
      kind: 'rate',
      goodWhen: 'up',
      color: 'var(--chart-1)',
      value: (t) => (goal ? t.convRate : null),
      n: (p) => p.baseVisitors,
    },
    revenue: { key: 'revenue', label: 'Net revenue', kind: 'money', goodWhen: 'up', color: 'var(--chart-4)', value: (t) => t.revenueMinor, n: (p) => p.purchases },
  }
}

/** The metrics shown for this site: Net revenue only when the site has revenue. */
export function visibleMetrics(showRevenue: boolean): Metric[] {
  return METRIC_ORDER.filter((m) => m !== 'revenue' || showRevenue)
}

export function fmtMetric(def: MetricDef, v: number | null, currency = 'USD'): string {
  if (v == null || !Number.isFinite(v)) return 'n/a'
  if (def.kind === 'rate') return fmtPct(v)
  if (def.kind === 'duration') return fmtDur(v)
  if (def.kind === 'money') return fmtMoney(v, currency)
  return fmtInt(v)
}

/** The chart line kind for a metric. */
export function chartKind(m: Metric): 'count' | 'rate' | 'duration' {
  return m === 'bounce' || m === 'conversion' ? 'rate' : m === 'duration' ? 'duration' : 'count'
}
