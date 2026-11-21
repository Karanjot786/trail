// The dashboard v3 API client: one function per §0.4 route. Frozen after P0.
// It goes only through getTransport() (§0.13), so no caller knows whether data is live or recorded.
// Report reads take the caller's query (`apiQuery(state, tz)`), add route params to a copy, and never mutate it.
import type {
  AIReferral, ApiToken, Campaign, Changes, Config, Crawlers, DropoffPerson, EventDetail, EventRow, Funnel,
  FunnelReport, FunnelStep, Goal, GoalDetail, GoalRow, Heatmap, InstallCheck, JourneySession, Live, Metric,
  NewToken, Note, PathsReport, Person, Revenue, RevenueRow, Row, SavedView, Series, SessionRow, Share, ShareMeta,
  Site, SiteStatus, SiteSummary, Stats, TokenScope, WhoAmI, Dim,
} from './types'
import { apiBase, getTransport, type TransportResponse } from './transport'

export { apiBase } from './transport'

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
/** 410: a share link that expired or was revoked. */
export class Gone extends HttpError {
  constructor(message = 'This link has expired or was revoked') {
    super(410, message)
  }
}

export interface List<T> {
  rows: T[]
  total: number
}
export interface ListOpts {
  limit?: number
  offset?: number
  sort?: string
}

function errorText(body: unknown, path: string, status: number): string {
  if (typeof body === 'string') {
    const t = body.trim()
    if (t) return t
  } else if (body && typeof body === 'object') {
    const o = body as { error?: unknown; message?: unknown }
    const m = o.error ?? o.message
    if (typeof m === 'string' && m) return m
  }
  return `${path}: ${status}`
}

function check(res: TransportResponse, path: string): TransportResponse {
  if (res.status >= 200 && res.status < 300) return res
  if (res.status === 401) throw new Unauthorized()
  const msg = errorText(res.body, path, res.status)
  if (res.status === 410) throw new Gone(msg)
  throw new HttpError(res.status, msg)
}

/** A copy of `q` with extra params set; empty and undefined values are skipped. */
function withParams(q: URLSearchParams, extra: Record<string, string | number | boolean | undefined | null> = {}): URLSearchParams {
  const p = new URLSearchParams(q)
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    p.set(k, v === true ? '1' : String(v))
  }
  return p
}
const listParams = (o: ListOpts) => ({ limit: o.limit, offset: o.offset, sort: o.sort })
const site = (id: string) => new URLSearchParams({ site: id })
const enc = encodeURIComponent

async function get<T>(path: string, p: URLSearchParams, signal?: AbortSignal): Promise<T> {
  return check(await getTransport().get(path, p, signal), path).body as T
}
async function list<T>(path: string, p: URLSearchParams, signal?: AbortSignal): Promise<List<T>> {
  const res = check(await getTransport().get(path, p, signal), path)
  const rows = Array.isArray(res.body) ? (res.body as T[]) : []
  const total = Number(res.headers['x-total-count'])
  return { rows, total: Number.isFinite(total) && res.headers['x-total-count'] != null ? total : rows.length }
}
async function send<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  return check(await getTransport().send(method, path, body), path).body as T
}

export const api = {
  // Session
  login: (password: string) => send<unknown>('POST', '/login', { password }).then(() => true, (e) => (e instanceof Unauthorized ? false : Promise.reject(e))),
  logout: () => send<unknown>('POST', '/logout').then(() => undefined),

  // Sites
  sites: (signal?: AbortSignal) => get<Site[]>('/sites', new URLSearchParams(), signal),
  sitesSummary: (q: URLSearchParams, signal?: AbortSignal) => get<SiteSummary[]>('/sites/summary', q, signal),
  createSite: (s: { id: string; domain: string; origins: string[] }) => send<Site>('POST', '/sites', s),
  updateSite: (id: string, patch: { domain?: string; origins?: string[] }) => send<Site>('PATCH', `/sites/${enc(id)}`, patch),
  deleteSite: (id: string, purge: boolean) => send<unknown>('DELETE', `/sites/${enc(id)}?purge=${purge ? 1 : 0}`).then(() => undefined),
  siteStatus: (id: string, signal?: AbortSignal) => get<SiteStatus>(`/sites/${enc(id)}/status`, new URLSearchParams(), signal),
  siteCheck: (id: string, signal?: AbortSignal) => get<InstallCheck>(`/sites/${enc(id)}/check`, new URLSearchParams(), signal),
  /** Full raw-event NDJSON.gz download (cookie auth only). */
  siteExportUrl: (id: string) => `${apiBase(location.pathname)}/sites/${enc(id)}/export`,

  // Overview
  stats: (q: URLSearchParams, signal?: AbortSignal) => get<Stats>('/stats', q, signal),
  series: (q: URLSearchParams, metric: Metric, extras?: boolean, signal?: AbortSignal) => get<Series>('/series', withParams(q, { metric, extras }), signal),
  breakdown: (q: URLSearchParams, dim: Dim, opts: ListOpts & { q?: string; conv?: number } = {}, signal?: AbortSignal) =>
    list<Row>('/breakdown', withParams(q, { dim, q: opts.q, conv: opts.conv, ...listParams(opts) }), signal),
  changes: (q: URLSearchParams, signal?: AbortSignal) => get<Changes>('/changes', q, signal),
  heatmap: (q: URLSearchParams, signal?: AbortSignal) => get<Heatmap>('/heatmap', q, signal),
  live: (q: URLSearchParams, signal?: AbortSignal) => get<Live>('/live', q, signal),

  // Notes
  notes: (q: URLSearchParams, signal?: AbortSignal) => get<Note[]>('/notes', q, signal),
  createNote: (n: Omit<Note, 'id'>) => send<Note>('POST', '/notes', n),
  deleteNote: (siteId: string, id: number) => send<unknown>('DELETE', `/notes/${id}?${site(siteId)}`).then(() => undefined),

  // Activity
  visitors: (q: URLSearchParams, opts: ListOpts & { q?: string } = {}, signal?: AbortSignal) =>
    list<Person>('/visitors', withParams(q, { q: opts.q, ...listParams(opts) }), signal),
  sessions: (q: URLSearchParams, opts: ListOpts & { person?: string } = {}, signal?: AbortSignal) =>
    list<SessionRow>('/sessions', withParams(q, { person: opts.person, ...listParams(opts) }), signal),
  journey: (q: URLSearchParams, person: string, signal?: AbortSignal) => get<JourneySession[]>('/journey', withParams(q, { person }), signal),
  events: (q: URLSearchParams, opts: ListOpts = {}, signal?: AbortSignal) => list<EventRow>('/events', withParams(q, listParams(opts)), signal),
  eventDetail: (q: URLSearchParams, name: string, signal?: AbortSignal) => get<EventDetail>('/events/detail', withParams(q, { name }), signal),

  // Acquisition
  campaigns: (q: URLSearchParams, opts: ListOpts = {}, signal?: AbortSignal) => list<Campaign>('/campaigns', withParams(q, listParams(opts)), signal),
  aiReferrals: (q: URLSearchParams, opts: ListOpts = {}, signal?: AbortSignal) => list<AIReferral>('/ai-referrals', withParams(q, listParams(opts)), signal),

  // Conversions
  goals: (siteId: string, signal?: AbortSignal) => get<Goal[] | null>('/goals', site(siteId), signal).then((g) => g ?? []),
  createGoal: (siteId: string, g: Omit<Goal, 'id'>) => send<Goal>('POST', '/goals', { site: siteId, ...g }),
  updateGoal: (siteId: string, id: number, patch: Partial<Omit<Goal, 'id'>>) => send<Goal>('PATCH', `/goals/${id}?${site(siteId)}`, patch),
  deleteGoal: (siteId: string, id: number) => send<unknown>('DELETE', `/goals/${id}?${site(siteId)}`).then(() => undefined),
  goalsReport: (q: URLSearchParams, signal?: AbortSignal) => get<GoalRow[]>('/goals/report', q, signal),
  goalDetail: (q: URLSearchParams, id: number, signal?: AbortSignal) => get<GoalDetail>(`/goals/${id}/detail`, q, signal),
  paths: (q: URLSearchParams, goal: number, signal?: AbortSignal) => get<PathsReport>('/paths', withParams(q, { goal }), signal),
  funnels: (siteId: string, signal?: AbortSignal) => get<Funnel[] | null>('/funnels', site(siteId), signal).then((f) => f ?? []),
  createFunnel: (siteId: string, f: { name: string; windowMs: number; steps: FunnelStep[] }) => send<Funnel>('POST', '/funnels', { site: siteId, ...f }),
  updateFunnel: (siteId: string, id: number, patch: { name?: string; windowMs?: number; steps?: FunnelStep[] }) =>
    send<Funnel>('PATCH', `/funnels/${id}?${site(siteId)}`, patch),
  deleteFunnel: (siteId: string, id: number) => send<unknown>('DELETE', `/funnels/${id}?${site(siteId)}`).then(() => undefined),
  funnelReport: (q: URLSearchParams, id: number, signal?: AbortSignal) => get<FunnelReport>(`/funnels/${id}/report`, q, signal),
  funnelDropoff: (q: URLSearchParams, id: number, step: number, opts: ListOpts = {}, signal?: AbortSignal) =>
    list<DropoffPerson>(`/funnels/${id}/dropoff`, withParams(q, { step, ...listParams(opts) }), signal),

  // Revenue and crawlers
  revenue: (q: URLSearchParams, signal?: AbortSignal) => get<Revenue>('/revenue', q, signal),
  revenueBreakdown: (q: URLSearchParams, dim: 'source' | 'channel' | 'campaign' | 'entry' | 'country' | 'device', opts: ListOpts = {}, signal?: AbortSignal) =>
    list<RevenueRow>('/revenue/breakdown', withParams(q, { dim, ...listParams(opts) }), signal),
  crawlers: (q: URLSearchParams, signal?: AbortSignal) => get<Crawlers>('/crawlers', q, signal),

  // Saved views, shares, tokens
  views: (siteId?: string, signal?: AbortSignal) => get<SavedView[]>('/views', siteId ? site(siteId) : new URLSearchParams(), signal),
  createView: (v: { name: string; site: string | null; state: string }) => send<SavedView>('POST', '/views', v),
  deleteView: (id: number) => send<unknown>('DELETE', `/views/${id}`).then(() => undefined),
  shares: (signal?: AbortSignal) => get<Share[]>('/shares', new URLSearchParams(), signal),
  createShare: (s: { site: string; label: string; state: string; hideRevenue: boolean; ttl: '24h' | '7d' | '30d' | 'never' }) => send<Share>('POST', '/shares', s),
  deleteShare: (id: string) => send<unknown>('DELETE', `/shares/${enc(id)}`).then(() => undefined),
  shareMeta: (signal?: AbortSignal) => get<ShareMeta>('/meta', new URLSearchParams(), signal),
  tokens: (signal?: AbortSignal) => get<ApiToken[]>('/tokens', new URLSearchParams(), signal),
  createToken: (t: { name: string; scope: TokenScope; site: string | null }) => send<NewToken>('POST', '/tokens', t),
  deleteToken: (id: string) => send<unknown>('DELETE', `/tokens/${enc(id)}`).then(() => undefined),
  whoami: (signal?: AbortSignal) => get<WhoAmI>('/v1/whoami', new URLSearchParams(), signal),
  config: (signal?: AbortSignal) => get<Config>('/config', new URLSearchParams(), signal),

  /** An attachment download of any list route: `trail-{site}-{report}-{from}-{to}.{ext}`. */
  exportUrl: (path: string, q: URLSearchParams, format: 'csv' | 'json') => `${apiBase(location.pathname)}${path}?${withParams(q, { format })}`,
}
