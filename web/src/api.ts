// Typed fetchers for the Trail dashboard wire contract (plan: "Wire contracts → Dashboard API").
// This is the only module that knows about mock mode (VITE_MOCK=1 → fixtures from mock.ts).

export type Env = 'production' | 'preview' | 'all'
export type Metric = 'visitors' | 'pageviews' | 'bounce'
export type Dim =
  | 'path'
  | 'route'
  | 'host'
  | 'referrer'
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'country'
  | 'device'
  | 'browser'
  | 'os'
  | 'event'

export interface Site {
  id: string
  domain: string
}
/** A site as Settings sees it: its allowed origins and recent activity. */
export interface SiteRow extends Site {
  origins: string[]
  created: number
  lastEventAt: number | null
  events24h: number
}
export interface SiteStatus {
  lastEventAt: number | null
  events24h: number
  rejected24h: number
}
export interface Totals {
  visitors: number
  pageviews: number
  bounce: number
}
export interface Stats extends Totals {
  prev: Totals
  online: number
}
export interface Point {
  t: number
  v: number
}
export interface Series {
  bucket: 'hour' | 'day'
  points: Point[]
}
export interface BreakdownRow {
  key: string
  visitors: number
  pageviews: number
  total: number
}
export interface Visitor {
  person: string
  identified: boolean
  firstSeen: number
  lastSeen: number
  visits: number
  country: string
  device: string
  source: string
}
export type StepType = 'pageview' | 'engage' | 'event' | 'identify' | 'error' | 'outbound' | 'form' | 'vital'
export interface Step {
  ts: number
  type: StepType
  path: string
  name: string
  engagedMs: number
  scrollPct: number
  props: Record<string, string>
}
export interface Session {
  sessionId: string
  start: number
  source: string
  steps: Step[]
}

export interface Goal {
  id: number
  name: string
  kind: 'page' | 'event'
  match: string
}
export interface GoalStats {
  conversions: number
  visitors: number
  rate: number
}
export interface GoalRow extends Goal, GoalStats {
  prev: GoalStats
}
export interface Delivery {
  events: number
  retried: number
  retriedRate: number
}

/** Common query: site, range (unix ms), env and dashboard-wide filters (dim → value). */
export interface Query {
  site: string
  from: number
  to: number
  env: Env
  filters: Partial<Record<Dim, string>>
}

export class Unauthorized extends Error {
  constructor() {
    super('unauthorized')
  }
}

/** A non-2xx response; `message` is the server's own text when it sent one. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function fail(res: Response, path: string): Promise<never> {
  if (res.status === 401) throw new Unauthorized()
  if (res.status === 403 && isDemo) readOnlyListeners.forEach((f) => f())
  const text = (await res.text().catch(() => '')).trim()
  let msg = text
  try {
    const j = JSON.parse(text)
    msg = typeof j === 'string' ? j : (j.error ?? j.message ?? text)
  } catch {
    /* plain text body */
  }
  throw new HttpError(res.status, msg || `${path}: ${res.status}`)
}

const MOCK = import.meta.env.VITE_MOCK === '1'
const mock = MOCK ? import('./mock') : null

/** `/demo*` reads the public, read-only demo API; everything else the real one. */
export function apiBase(pathname: string): string {
  return /^\/demo(\/|$)/.test(pathname) ? '/api/demo' : '/api'
}
const BASE = apiBase(location.pathname)
/** True on the public demo: no login, one sample site, nothing editable. */
export const isDemo = BASE === '/api/demo'
export const DEMO_SITE: Site = { id: 'demo', domain: 'demo.trail.dev' }

type Listener = () => void
const readOnlyListeners = new Set<Listener>()
/** Fires when the demo server refuses a write (403). */
export const onReadOnly = (f: Listener) => (readOnlyListeners.add(f), () => void readOnlyListeners.delete(f))

function params(q: Query, extra: Record<string, string | number | undefined> = {}) {
  const p = new URLSearchParams({ site: q.site, from: String(q.from), to: String(q.to), env: q.env })
  for (const [dim, value] of Object.entries(q.filters)) if (value != null) p.append('f', `${dim}:${value}`)
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') p.set(k, String(v))
  return p
}

async function get<T>(path: string, p: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${path}?${p}`, { signal, credentials: 'same-origin' })
  if (!res.ok) return fail(res, path)
  return res.json() as Promise<T>
}

async function send<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return fail(res, path)
  return res.json() as Promise<T>
}

/** Props may arrive as an object or as the stored JSON string; normalise to a flat string map. */
function normProps(p: unknown): Record<string, string> {
  if (!p) return {}
  if (typeof p === 'string') {
    try {
      return normProps(JSON.parse(p))
    } catch {
      return {}
    }
  }
  if (typeof p !== 'object') return {}
  return Object.fromEntries(Object.entries(p as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
}

export const api = {
  async login(password: string): Promise<boolean> {
    if (mock) return true
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    return res.ok
  },

  async sites(signal?: AbortSignal): Promise<Site[]> {
    // The demo API serves a single fixed site and has no /sites route.
    if (isDemo) return [DEMO_SITE]
    if (mock) return (await mock).sites()
    return get('/api/sites', new URLSearchParams(), signal)
  },

  async siteRows(signal?: AbortSignal): Promise<SiteRow[]> {
    if (mock) return (await mock).siteRows()
    return get('/api/sites', new URLSearchParams(), signal)
  },

  async createSite(s: { id: string; domain: string; origins: string[] }): Promise<SiteRow> {
    if (mock) return (await mock).createSite(s)
    return send('POST', '/api/sites', s)
  },

  async updateSite(id: string, patch: { domain?: string; origins?: string[] }): Promise<SiteRow> {
    if (mock) return (await mock).updateSite(id, patch)
    return send('PATCH', `/api/sites/${encodeURIComponent(id)}`, patch)
  },

  async deleteSite(id: string, purge: boolean): Promise<void> {
    if (mock) return (await mock).deleteSite(id)
    const path = `/api/sites/${encodeURIComponent(id)}?purge=${purge ? 1 : 0}`
    const res = await fetch(path, { method: 'DELETE', credentials: 'same-origin' })
    if (!res.ok) return fail(res, path)
  },

  async siteStatus(id: string, signal?: AbortSignal): Promise<SiteStatus> {
    if (mock) return (await mock).siteStatus(id)
    return get(`/api/sites/${encodeURIComponent(id)}/status`, new URLSearchParams(), signal)
  },

  async stats(q: Query, signal?: AbortSignal): Promise<Stats> {
    if (mock) return (await mock).stats(q)
    return get(`${BASE}/stats`, params(q), signal)
  },

  async series(q: Query, metric: Metric, signal?: AbortSignal): Promise<Series> {
    if (mock) return (await mock).series(q, metric)
    return get(`${BASE}/series`, params(q, { metric }), signal)
  },

  async breakdown(
    q: Query,
    dim: Dim,
    opts: { limit?: number; q?: string } = {},
    signal?: AbortSignal,
  ): Promise<BreakdownRow[]> {
    if (mock) return (await mock).breakdown(q, dim, opts.q ?? '', opts.limit ?? 10)
    return get(`${BASE}/breakdown`, params(q, { dim, limit: opts.limit, q: opts.q }), signal)
  },

  async visitors(q: Query, opts: { limit?: number; q?: string } = {}, signal?: AbortSignal): Promise<Visitor[]> {
    if (mock) return (await mock).visitors(q, opts.q ?? '', opts.limit ?? 100)
    return get(`${BASE}/visitors`, params(q, { limit: opts.limit, q: opts.q }), signal)
  },

  async journey(site: string, person: string, signal?: AbortSignal): Promise<Session[]> {
    const raw = mock
      ? await (await mock).journey(site, person)
      : await get<Session[]>(`${BASE}/journey`, new URLSearchParams({ site, person }), signal)
    return (raw ?? []).map((s) => ({
      ...s,
      steps: (s.steps ?? []).map((st) => ({ ...st, props: normProps(st.props) })),
    }))
  },

  async goals(site: string, signal?: AbortSignal): Promise<Goal[]> {
    if (mock) return (await mock).goals(site)
    return (await get<Goal[] | null>(`${BASE}/goals`, new URLSearchParams({ site }), signal)) ?? []
  },

  async createGoal(site: string, g: Omit<Goal, 'id'>): Promise<Goal> {
    if (mock) return (await mock).createGoal(site, g)
    const res = await fetch(`${BASE}/goals`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site, ...g }),
    })
    if (!res.ok) return fail(res, `${BASE}/goals`)
    return res.json() as Promise<Goal>
  },

  async deleteGoal(site: string, id: number): Promise<void> {
    if (mock) return (await mock).deleteGoal(site, id)
    const res = await fetch(`${BASE}/goals/${id}?${new URLSearchParams({ site })}`, { method: 'DELETE', credentials: 'same-origin' })
    if (!res.ok) return fail(res, `${BASE}/goals`)
  },

  async goalReport(q: Query, signal?: AbortSignal): Promise<GoalRow[]> {
    if (mock) return (await mock).goalReport(q)
    return (await get<GoalRow[] | null>(`${BASE}/goals/report`, params(q), signal)) ?? []
  },

  async delivery(q: Query, signal?: AbortSignal): Promise<Delivery> {
    if (mock) return (await mock).delivery(q)
    return get(`${BASE}/delivery`, params(q), signal)
  },
}
