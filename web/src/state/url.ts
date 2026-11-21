// URL-state schema (plan §0.8). The URL holds the whole dashboard state. Frozen after P0.
// parseUrl is total: any path and query yield a valid state, plus a replace-redirect for legacy or unknown links.
import type { CmpKey, Dim, Env, Filter, Metric, RangeKey } from '../api/types'

export type ScreenId = 'overview' | 'live' | 'acquisition' | 'activity' | 'conversions' | 'revenue' | 'crawlers' | 'settings'
export type Sheet =
  | { kind: 'journey'; person: string; session?: string } // v=person or v=person~session
  | { kind: 'row'; dim: Dim; key: string } // dr=dim|key
  | { kind: 'report'; panel: string; tab: string } // rep=panel:tab
  | { kind: 'event'; name: string } // evn=name
  | { kind: 'dropoff'; funnel: number; step: number } // fd=funnel:step
export interface UrlState {
  prefix: '' | '/demo' | `/share/${string}`
  screen: ScreenId
  tab: string
  id: number | null
  site: string // site=
  range: RangeKey // range= (default 30d, omitted when default)
  cmp: CmpKey // cmp= (default prev)
  env: Env // env= (default production)
  metric: Metric // metric= (default visitors)
  filters: Filter[] // f=dim:value, repeated, URL order kept
  panels: Record<string, string> // p.<panel>=<tab>, e.g. p.pages=exit
  sheet: Sheet | null
  hideRevenue: boolean // hr=1, honoured only under /share/
}

/** Tabs per screen, default first. Screens without tabs have an empty list. */
export const SCREEN_TABS: Record<ScreenId, readonly string[]> = {
  overview: [],
  live: [],
  acquisition: ['sources', 'ai', 'campaigns', 'landing'],
  activity: ['visitors', 'sessions', 'events', 'paths'],
  conversions: ['goals', 'funnels'],
  revenue: [],
  crawlers: [],
  settings: ['sites', 'install', 'assistants', 'tokens', 'sharing', 'data', 'config'],
}
/** Path segment per screen; the overview is the root. */
export const SCREEN_PATH: Record<ScreenId, string> = {
  overview: '',
  live: 'live',
  acquisition: 'acquisition',
  activity: 'activity',
  conversions: 'conversions',
  revenue: 'revenue',
  crawlers: 'crawlers',
  settings: 'settings',
}
/** Overview panel ids and their tabs, default tab first. */
export const PANELS: Record<string, readonly string[]> = {
  pages: ['pages', 'entry', 'exit', 'routes', 'hosts'],
  sources: ['sources', 'channels', 'ai', 'campaigns'],
  location: ['countries', 'regions', 'cities'],
  devices: ['devices', 'browsers', 'os'],
  events: ['events'],
  goals: ['goals'],
}
export const DIMS: readonly Dim[] = [
  'path', 'route', 'host', 'entry', 'exit',
  'referrer', 'source', 'channel', 'ai_source',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'country', 'region', 'city', 'device', 'browser', 'os',
  'event', 'goal', 'dow', 'hour',
]
const METRICS: readonly Metric[] = ['visitors', 'pageviews', 'sessions', 'duration', 'bounce', 'conversion', 'revenue']
const ENVS: readonly Env[] = ['production', 'preview', 'development', 'all']
const RANGES = ['today', 'yesterday', 'wtd', 'mtd', 'lastmonth', '7d', '30d', '90d', '12mo']
const LEGACY_RANGE: Record<string, RangeKey> = { '24h': 'today', '3mo': '90d' }
const ISO = String.raw`\d{4}-\d{2}-\d{2}`
const DAY_RE = new RegExp(`^d:${ISO}$`)
const CUSTOM_RE = new RegExp(`^c:${ISO}~${ISO}$`)
const CMP_RE = new RegExp(`^c:${ISO}$`)

export const DEFAULTS = { range: '30d', cmp: 'prev', env: 'production', metric: 'visitors' } as const

export function defaultState(): UrlState {
  return {
    prefix: '', screen: 'overview', tab: '', id: null, site: '',
    range: DEFAULTS.range, cmp: DEFAULTS.cmp, env: DEFAULTS.env, metric: DEFAULTS.metric,
    filters: [], panels: {}, sheet: null, hideRevenue: false,
  }
}

const isDim = (d: string): d is Dim => (DIMS as readonly string[]).includes(d)
const isScreen = (s: string): s is ScreenId => s in SCREEN_PATH
const isRange = (r: string): r is RangeKey => RANGES.includes(r) || DAY_RE.test(r) || CUSTOM_RE.test(r)
const toInt = (s: string | undefined): number | null => (s != null && /^\d{1,15}$/.test(s) ? Number(s) : null)
const splitOnce = (s: string, sep: string): [string, string] | null => {
  const i = s.indexOf(sep)
  return i < 0 ? null : [s.slice(0, i), s.slice(i + sep.length)]
}

function parseSheet(q: URLSearchParams): Sheet | null {
  const v = q.get('v')
  if (v) {
    const [person, session] = splitOnce(v, '~') ?? [v, '']
    if (person) return session ? { kind: 'journey', person, session } : { kind: 'journey', person }
  }
  const dr = splitOnce(q.get('dr') ?? '', '|')
  if (dr && isDim(dr[0]) && dr[1]) return { kind: 'row', dim: dr[0], key: dr[1] }
  const rep = splitOnce(q.get('rep') ?? '', ':')
  if (rep && PANELS[rep[0]]?.includes(rep[1])) return { kind: 'report', panel: rep[0], tab: rep[1] }
  const evn = q.get('evn')
  if (evn) return { kind: 'event', name: evn }
  const fd = splitOnce(q.get('fd') ?? '', ':')
  const funnel = toInt(fd?.[0]), step = toInt(fd?.[1])
  if (funnel != null && step != null) return { kind: 'dropoff', funnel, step }
  return null
}

export function parseUrl(pathname: string, search: string): { state: UrlState; redirect: string | null; invalidRange: string | null } {
  const s = defaultState()
  const q = new URLSearchParams(search)
  let legacy = false

  // Prefix: /demo or /share/{token}.
  let rest = pathname || '/'
  const share = /^\/share\/([^/]+)(?=\/|$)/.exec(rest)
  if (share) {
    s.prefix = `/share/${share[1]}`
    rest = rest.slice(share[0].length)
  } else if (/^\/demo(?=\/|$)/.test(rest)) {
    s.prefix = '/demo'
    rest = rest.slice(5)
  }
  let segs = rest.split('/').filter(Boolean)

  // Legacy paths and views.
  if (segs[0] === 'people') {
    legacy = true
    segs = ['activity', ...segs.slice(1).map((x) => (x === 'visits' ? 'sessions' : x))]
  }
  const view = q.get('view')
  if (view === 'visitors' || view === 'settings') {
    legacy = true
    segs = view === 'visitors' ? ['activity', 'visitors'] : ['settings', 'sites']
  }

  // Screen, tab and id.
  const head = segs[0] ?? ''
  const screen = (Object.keys(SCREEN_PATH) as ScreenId[]).find((id) => SCREEN_PATH[id] === head)
  let unknownPath = false
  if (screen && isScreen(screen)) {
    s.screen = screen
    const tabs = SCREEN_TABS[screen]
    if (tabs.length) {
      s.tab = segs[1] ?? tabs[0]
      if (!tabs.includes(s.tab)) {
        s.tab = tabs[0]
        unknownPath = true
      }
      if (screen === 'conversions' && segs[2] != null) {
        s.id = toInt(segs[2])
        if (s.id == null) unknownPath = true
      }
      if (segs.length > (screen === 'conversions' ? 3 : 2)) unknownPath = true
    } else if (segs.length > 1) unknownPath = true
  } else {
    unknownPath = true
  }

  // Query keys.
  s.site = q.get('site') ?? ''
  let invalidRange: string | null = null
  const range = q.get('range')
  if (range != null) {
    if (LEGACY_RANGE[range]) {
      s.range = LEGACY_RANGE[range]
      legacy = true
    } else if (isRange(range)) s.range = range
    else invalidRange = range
  }
  const cmp = q.get('cmp')
  if (cmp === 'none' || cmp === 'prev' || (cmp != null && CMP_RE.test(cmp))) s.cmp = cmp as CmpKey
  const env = q.get('env')
  if (env && (ENVS as readonly string[]).includes(env)) s.env = env as Env
  const metric = q.get('metric')
  if (metric && (METRICS as readonly string[]).includes(metric)) s.metric = metric as Metric

  const seen = new Set<string>()
  for (const raw of q.getAll('f')) {
    const kv = splitOnce(raw, ':')
    if (!kv || !isDim(kv[0]) || !kv[1] || seen.has(kv[0])) continue
    seen.add(kv[0])
    s.filters.push({ dim: kv[0], value: kv[1] })
  }
  for (const [k, v] of q) {
    if (!k.startsWith('p.')) continue
    const panel = k.slice(2)
    if (PANELS[panel]?.includes(v)) s.panels[panel] = v
  }

  const person = q.get('person')
  if (person) {
    legacy = true
    s.screen = 'activity'
    s.tab = 'visitors'
    s.id = null
    s.sheet = { kind: 'journey', person }
  } else s.sheet = parseSheet(q)

  s.hideRevenue = s.prefix.startsWith('/share/') && q.get('hr') === '1'

  return { state: s, redirect: legacy || unknownPath ? serializeUrl(s) : null, invalidRange }
}

function pathOf(s: UrlState): string {
  const parts = [SCREEN_PATH[s.screen]]
  if (SCREEN_TABS[s.screen].length) parts.push(s.tab || SCREEN_TABS[s.screen][0])
  if (s.screen === 'conversions' && s.id != null) parts.push(String(s.id))
  return `${s.prefix}/${parts.filter(Boolean).join('/')}`
}

function viewParams(s: UrlState): URLSearchParams {
  const q = new URLSearchParams()
  if (s.site) q.set('site', s.site)
  if (s.range !== DEFAULTS.range) q.set('range', s.range)
  if (s.cmp !== DEFAULTS.cmp) q.set('cmp', s.cmp)
  if (s.env !== DEFAULTS.env) q.set('env', s.env)
  if (s.metric !== DEFAULTS.metric) q.set('metric', s.metric)
  for (const f of s.filters) q.append('f', `${f.dim}:${f.value}`)
  for (const panel of Object.keys(s.panels).sort()) {
    if (s.panels[panel] !== PANELS[panel]?.[0]) q.set(`p.${panel}`, s.panels[panel])
  }
  return q
}

function sheetParams(q: URLSearchParams, sheet: Sheet | null) {
  if (!sheet) return
  switch (sheet.kind) {
    case 'journey':
      q.set('v', sheet.session ? `${sheet.person}~${sheet.session}` : sheet.person)
      break
    case 'row':
      q.set('dr', `${sheet.dim}|${sheet.key}`)
      break
    case 'report':
      q.set('rep', `${sheet.panel}:${sheet.tab}`)
      break
    case 'event':
      q.set('evn', sheet.name)
      break
    case 'dropoff':
      q.set('fd', `${sheet.funnel}:${sheet.step}`)
      break
  }
}

/** path + '?' + query; defaults omitted; stable key order (site, range, cmp, env, metric, f, p.*, sheet, hr). */
export function serializeUrl(s: UrlState): string {
  const q = viewParams(s)
  sheetParams(q, s.sheet)
  if (s.hideRevenue && s.prefix.startsWith('/share/')) q.set('hr', '1')
  const qs = q.toString()
  return pathOf(s) + (qs ? `?${qs}` : '')
}

/** Query string for a saved view: no sheet, no prefix, no share-only keys. */
export function viewState(s: UrlState): string {
  return viewParams(s).toString()
}

/** site, range, cmp, env, tz, f… for /api calls. */
export function apiQuery(s: UrlState, tz: string): URLSearchParams {
  const q = new URLSearchParams({ site: s.site, range: s.range, cmp: s.cmp, env: s.env, tz })
  for (const f of s.filters) q.append('f', `${f.dim}:${f.value}`)
  return q
}
