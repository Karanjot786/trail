// URL-synced dashboard state: site, range, env, filters, metric, view, person.
import { useSyncExternalStore } from 'react'
import type { Dim, Env, Metric, Query } from './api'
import { DAY, HOUR, MIN } from './time'

export type Range = '24h' | '7d' | '30d' | '3mo' | '12mo' | 'custom'
export type View = 'overview' | 'visitors' | 'settings'

export const RANGES: { value: Range; label: string; ms: number }[] = [
  { value: '24h', label: 'Last 24 Hours', ms: 24 * HOUR },
  { value: '7d', label: 'Last 7 Days', ms: 7 * DAY },
  { value: '30d', label: 'Last 30 Days', ms: 30 * DAY },
  { value: '3mo', label: 'Last 3 Months', ms: 90 * DAY },
  { value: '12mo', label: 'Last 12 Months', ms: 365 * DAY },
  { value: 'custom', label: 'Custom', ms: 0 },
]
const DIMS: Dim[] = ['path', 'route', 'host', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'country', 'device', 'browser', 'os', 'event']

export interface DashState {
  site: string
  range: Range
  from: number
  to: number
  env: Env
  filters: Partial<Record<Dim, string>>
  metric: Metric
  view: View
  person: string
}

export type Patch = Partial<Omit<DashState, 'from' | 'to'>> & { from?: number; to?: number }

// `now` is pinned so preset ranges don't drift (and refetch) on every render; refreshed on change.
let now = Math.floor(Date.now() / MIN) * MIN

function parse(search: string): DashState {
  const p = new URLSearchParams(search)
  const range = (RANGES.some((r) => r.value === p.get('range')) ? p.get('range') : '7d') as Range
  const filters: DashState['filters'] = {}
  for (const f of p.getAll('f')) {
    const i = f.indexOf(':')
    const dim = f.slice(0, i) as Dim
    if (i > 0 && DIMS.includes(dim)) filters[dim] = f.slice(i + 1)
  }
  const preset = RANGES.find((r) => r.value === range)!
  let from = now - preset.ms
  let to = now
  if (range === 'custom') {
    from = Number(p.get('from')) || now - 7 * DAY
    to = Number(p.get('to')) || now
  }
  const env = p.get('env')
  const metric = p.get('metric')
  return {
    site: p.get('site') ?? '',
    range,
    from,
    to,
    env: env === 'preview' || env === 'all' ? env : 'production',
    filters,
    metric: metric === 'pageviews' || metric === 'bounce' ? metric : 'visitors',
    view: p.get('person') ? 'visitors' : p.get('view') === 'visitors' || p.get('view') === 'settings' ? (p.get('view') as View) : 'overview',
    person: p.get('person') ?? '',
  }
}

function serialize(s: DashState): string {
  const p = new URLSearchParams()
  if (s.site) p.set('site', s.site)
  if (s.range !== '7d') p.set('range', s.range)
  if (s.range === 'custom') {
    p.set('from', String(s.from))
    p.set('to', String(s.to))
  }
  if (s.env !== 'production') p.set('env', s.env)
  if (s.metric !== 'visitors') p.set('metric', s.metric)
  if (s.view !== 'overview') p.set('view', s.view)
  if (s.person) p.set('person', s.person)
  for (const [d, v] of Object.entries(s.filters)) if (v != null) p.append('f', `${d}:${v}`)
  const q = p.toString()
  return q ? `?${q}` : location.pathname
}

let state = parse(location.search)
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

window.addEventListener('popstate', () => {
  state = parse(location.search)
  emit()
})

export function set(patch: Patch, opts: { push?: boolean } = {}) {
  now = Math.floor(Date.now() / MIN) * MIN
  const next: DashState = { ...state, ...patch }
  if (next.range !== 'custom') {
    const preset = RANGES.find((r) => r.value === next.range)!
    next.from = now - preset.ms
    next.to = now
  }
  state = next
  const url = serialize(next)
  if (opts.push) history.pushState(null, '', url)
  else history.replaceState(null, '', url)
  emit()
}

/** Re-pin "now" so preset ranges include the latest data. */
export function refresh() {
  set({})
}

export function useDashboard(): DashState & { set: typeof set; refresh: typeof refresh; query: Query } {
  const s = useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => state,
  )
  return { ...s, set, refresh, query: queryOf(s) }
}

const queryCache = new WeakMap<DashState, Query>()
/** Stable Query object per state snapshot, so effects keyed on it don't loop. */
export function queryOf(s: DashState): Query {
  let q = queryCache.get(s)
  if (!q) queryCache.set(s, (q = { site: s.site, from: s.from, to: s.to, env: s.env, filters: s.filters }))
  return q
}

export function queryKey(q: Query, ...extra: unknown[]) {
  return JSON.stringify([q.site, q.from, q.to, q.env, q.filters, ...extra])
}
