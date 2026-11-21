// The metric columns every Acquisition table shares: Visitors (with the one-rule bar), Sessions, Views,
// % of total, Bounce, {Goal} rate (first touch), Revenue (first touch, only when the site has purchases).
import type { Dim, Filter } from '../../api/types'
import type { TableColumn } from '../../data/DataTable'
import { fmtInt, fmtMoney, fmtPct } from '../../lib/format'
import { navigate } from '../../state/useUrlState'
import { BarCell } from '../conversions/kit'

export interface Metrics {
  visitors: number
  sessions?: number
  views?: number
  bounce?: number | null
  convRate?: number | null
  revenueMinor?: number
}
export interface MetricCtx {
  max: number
  total: number | null
  goalName: string | null
  revenue: boolean
  currency: string
}

const na = (why: string) => (
  <span className="subtle" title={why}>
    n/a<span className="sr-only"> ({why})</span>
  </span>
)

export function metricColumns<T extends Metrics>(c: MetricCtx, opts: { views?: boolean; share?: boolean } = {}): TableColumn<T>[] {
  const cols: TableColumn<T>[] = [
    {
      id: 'visitors',
      header: 'Visitors',
      accessorFn: (r) => r.visitors,
      meta: { align: 'r', definition: 'People with at least one visit from this row in the range (any visit).' },
      cell: (r) => <BarCell value={r.visitors} max={c.max}>{fmtInt(r.visitors)}</BarCell>,
    },
    { id: 'sessions', header: 'Sessions', accessorFn: (r) => r.sessions ?? 0, meta: { align: 'r', hideSm: true }, cell: (r) => fmtInt(r.sessions ?? 0) },
  ]
  if (opts.views !== false) cols.push({ id: 'views', header: 'Views', accessorFn: (r) => r.views ?? 0, meta: { align: 'r', hideSm: true }, cell: (r) => fmtInt(r.views ?? 0) })
  if (opts.share !== false)
    cols.push({
      id: 'share',
      header: '% of total',
      accessorFn: (r) => r.visitors,
      meta: { align: 'r', hideSm: true, definition: 'Visitors in this row of all visitors in the range. Rows overlap, so they can add up to more than 100%.' },
      cell: (r) => (c.total && c.total > 0 ? fmtPct(r.visitors / c.total) : na('the range total is not known yet')),
    })
  cols.push(
    { id: 'bounce', header: 'Bounce', accessorFn: (r) => r.bounce ?? -1, meta: { align: 'r', hideSm: true }, cell: (r) => (r.bounce == null ? na('no sessions') : fmtPct(r.bounce)) },
    {
      id: 'conv',
      header: c.goalName ? `${c.goalName} rate` : 'Goal rate',
      accessorFn: (r) => r.convRate ?? -1,
      meta: { align: 'r', definition: 'Visitors who reached the goal, of the visitors whose first visit came from this row (first touch).' },
      cell: (r) => (!c.goalName ? na('no goal on this site yet; add one in Conversions') : r.convRate == null ? na('too few visitors to say') : fmtPct(r.convRate)),
    },
  )
  if (c.revenue)
    cols.push({
      id: 'revenue',
      header: 'Revenue (first touch)',
      accessorFn: (r) => r.revenueMinor ?? 0,
      meta: { align: 'r', hideSm: true, definition: 'Purchases reported by your site, credited to where the buyer first came from.' },
      cell: (r) => fmtMoney(r.revenueMinor ?? 0, c.currency),
    })
  return cols
}

export const openRow = (dim: Dim, key: string) => navigate({ sheet: { kind: 'row', dim, key } })

/** One filter per dim: set it, or remove it when it is already on. */
export function toggleFilter(filters: Filter[], dim: Dim, value: string) {
  const on = filters.some((f) => f.dim === dim && f.value === value)
  const rest = filters.filter((f) => f.dim !== dim)
  navigate({ filters: on ? rest : [...rest, { dim, value }] })
}
