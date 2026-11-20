// Fixture backend for `VITE_MOCK=1`. Generates a deterministic, India-heavy, mobile-heavy event log
// per site and answers every dashboard endpoint from it with the same rules the Go server uses
// (person = earliest identified user for the anon, engaged-session bounce, prev period, hour/day
// buckets in TZ). Only api.ts imports this module.
import type { BreakdownRow, Delivery, Dim, Goal, GoalRow, GoalStats, Metric, Query, Series, Session, Site, Stats, Step, Visitor } from './api'
import { DAY, HOUR, MIN, TZ, startOfDay, startOfHour } from './time'

interface Ev {
  ts: number
  type: Step['type']
  anon: string
  session: string
  person: string
  identified: boolean
  host: string
  path: string
  route: string
  referrer: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  country: string
  device: string
  browser: string
  os: string
  env: 'production' | 'preview'
  name: string
  props: Record<string, string>
  engagedMs: number
  scrollPct: number
}

const SITES: Site[] = [
  { id: 'reelcn', domain: 'reelcn.vercel.app' },
  { id: 'notes', domain: 'notes.ksd.dev' },
  { id: 'blog', domain: 'ksd.dev' },
]

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type R = () => number
const pick = <T,>(r: R, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
function weighted<T>(r: R, xs: readonly (readonly [T, number])[]): T {
  const total = xs.reduce((s, [, w]) => s + w, 0)
  let x = r() * total
  for (const [v, w] of xs) if ((x -= w) < 0) return v
  return xs[xs.length - 1][0]
}
const hex = (r: R, n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('')

const COUNTRIES = [
  ['IN', 58], ['US', 11], ['SG', 4], ['GB', 4], ['DE', 3], ['BD', 3], ['AE', 3], ['CA', 2],
  ['NP', 2], ['JP', 2], ['ID', 2], ['BR', 2], ['AU', 1], ['FR', 1], ['NL', 1], ['LK', 1],
] as const
const PATHS = [
  ['/', 30], ['/docs/components', 9], ['/docs/components/data-story', 8], ['/docs/components/listicle-short', 7],
  ['/docs/components/app-promo', 6], ['/docs/components/tutorial', 5], ['/docs/components/animate', 4],
  ['/pricing', 6], ['/blog', 4], ['/blog/launch-week', 3], ['/blog/412', 2], ['/changelog', 3],
  ['/templates/reel-starter', 3], ['/signup', 2],
] as const
const REFERRERS = [
  ['', 34], ['google.com', 32], ['github.com', 9], ['x.com', 6], ['linkedin.com', 4],
  ['reddit.com', 4], ['news.ycombinator.com', 3], ['bing.com', 2], ['duckduckgo.com', 2], ['chatgpt.com', 4],
] as const
const UTMS = [
  ['', '', '', 85], ['newsletter', 'email', 'nov-digest', 6], ['twitter', 'social', 'launch-week', 5],
  ['producthunt', 'referral', 'launch', 4],
] as const
const OUTBOUND = ['https://github.com/ksd/reelcn', 'https://www.remotion.dev/docs', 'https://x.com/ksd', 'https://vercel.com/templates']
const ERRORS = [
  "TypeError: Cannot read properties of undefined (reading 'duration')",
  'ChunkLoadError: Loading chunk 412 failed.',
  'ResizeObserver loop completed with undelivered notifications.',
]
const EVENTS = ['Copy Code', 'Download Template', 'Play Preview', 'Signup'] as const

function deriveRoute(path: string) {
  return path.replace(/\/\d+(?=\/|$)/g, '/:id')
}

function device(r: R) {
  const d = weighted(r, [['mobile', 66], ['desktop', 30], ['tablet', 4]] as const)
  if (d === 'desktop') {
    const os = weighted(r, [['Windows', 52], ['Mac', 32], ['GNU/Linux', 16]] as const)
    const browser = os === 'Mac' ? weighted(r, [['Chrome', 60], ['Safari', 30], ['Arc', 10]] as const)
      : weighted(r, [['Chrome', 70], ['Edge', 18], ['Firefox', 12]] as const)
    return { device: d, os, browser }
  }
  const os = d === 'tablet' ? weighted(r, [['iOS', 60], ['Android', 40]] as const) : weighted(r, [['Android', 76], ['iOS', 24]] as const)
  const browser = os === 'iOS' ? weighted(r, [['Safari', 80], ['Chrome', 20]] as const)
    : weighted(r, [['Chrome', 78], ['Samsung Internet', 14], ['Opera', 8]] as const)
  return { device: d, os, browser }
}

function generate(site: Site, now: number): Ev[] {
  const r = rng([...site.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7))
  const scale = site.id === 'reelcn' ? 1 : site.id === 'notes' ? 0.35 : 0.2
  const persons = Math.round(1400 * scale)
  const out: Ev[] = []

  const session = (
    p: { anon: string; person: string; identified: boolean; country: string; device: string; os: string; browser: string },
    start: number,
    opts: { referrer?: string; paths?: string[]; identifyAt?: number; userId?: string; extra?: (push: (e: Partial<Ev>) => void, t: number) => void } = {},
  ) => {
    const sid = hex(r, 12)
    const env: Ev['env'] = r() < 0.07 ? 'preview' : 'production'
    const host = env === 'preview' ? `${site.id}-git-${pick(r, ['main', 'feat-ui', 'fix-nav'])}.vercel.app` : site.domain
    const referrer = opts.referrer ?? weighted(r, REFERRERS)
    const [utm_source, utm_medium, utm_campaign] = (() => {
      const u = weighted(r, UTMS.map((x) => [x, x[3]] as const))
      return [u[0], u[1], u[2]]
    })()
    const base = { anon: p.anon, session: sid, person: p.person, identified: p.identified, host, referrer, utm_source, utm_medium, utm_campaign,
      country: p.country, device: p.device, browser: p.browser, os: p.os, env, name: '', props: {}, engagedMs: 0, scrollPct: 0 }
    const push = (e: Partial<Ev>) => out.push({ ...base, ts: t, type: 'pageview', path: lastPath, route: deriveRoute(lastPath), ...e } as Ev)
    let t = start
    let lastPath = '/'
    const n = opts.paths?.length ?? weighted(r, [[1, 66], [2, 14], [3, 9], [4, 6], [5, 3], [6, 2]] as const)
    for (let i = 0; i < n; i++) {
      lastPath = opts.paths?.[i] ?? (i === 0 && r() < 0.5 ? '/' : weighted(r, PATHS))
      if (t > now) break
      push({ type: 'pageview' })
      const engaged = Math.round(n === 1 && r() < 0.85 ? 1500 + r() * 7000 : 4000 + r() * 150_000)
      const scroll = Math.min(100, Math.round(10 + r() * 95))
      if (opts.extra && i === n - 1) opts.extra(push, t + Math.round(engaged / 2))
      if (i === opts.identifyAt && opts.userId) {
        t += Math.round(engaged / 3)
        if (lastPath === '/signup') push({ type: 'event', name: 'Signup', props: { plan: 'free' } })
        push({ type: 'identify', name: opts.userId, props: {} })
      } else if (r() < 0.06) {
        push({ type: 'event', name: pick(r, EVENTS.slice(0, 3)), props: { component: lastPath.split('/').pop() || 'home' } })
      }
      if (r() < 0.025) push({ type: 'error', name: 'error', props: { message: pick(r, ERRORS) } })
      if (r() < 0.05) push({ type: 'outbound', name: 'outbound', props: { url: pick(r, OUTBOUND) } })
      if (lastPath === '/signup' && r() < 0.5) push({ type: 'form', name: 'signup-form', props: {} })
      t += engaged
      if (t > now) break
      push({ type: 'engage', engagedMs: engaged, scrollPct: scroll, ts: t })
      t += Math.round(2000 + r() * 8000)
    }
  }

  const SPAN = 120 * DAY
  for (let i = 0; i < persons; i++) {
    const dev = device(r)
    const country = weighted(r, COUNTRIES)
    const anon = `0193${hex(r, 4)}-${hex(r, 4)}-7${hex(r, 3)}-${hex(r, 4)}-${hex(r, 12)}`
    const identifies = r() < 0.3
    const userId = `user_${100 + Math.floor(r() * 9000)}`
    const p = { anon, person: identifies ? userId : anon, identified: identifies, country, ...dev }
    // Recency-weighted first visit so recent ranges are busier than old ones.
    let t = now - Math.pow(r(), 1.15) * SPAN
    const visits = weighted(r, [[1, 55], [2, 25], [3, 12], [4, 8]] as const)
    for (let v = 0; v < visits && t < now; v++) {
      // IST-shaped time of day: busy 10:00–23:00.
      const day = startOfDay(t)
      t = day + (9.5 + r() * 14) * HOUR
      if (t > now) t = now - r() * 6 * HOUR
      const last = identifies && v === visits - 1
      // Identified people either sign up (pricing → signup) or just log in on the home page.
      session(p, t, last ? (r() < 0.45 ? { identifyAt: 1, paths: ['/pricing', '/signup'], userId } : { identifyAt: 0, paths: ['/'], userId }) : {})
      t += (1 + r() * 9) * DAY
    }
    // Some identified persons also come back on a second device (anon merge through user_id).
    if (identifies && r() < 0.15) {
      const p2 = { ...p, anon: `0193${hex(r, 4)}-${hex(r, 4)}-7${hex(r, 3)}-${hex(r, 4)}-${hex(r, 12)}`, ...device(r) }
      session(p2, now - r() * 20 * DAY, { identifyAt: 0, paths: ['/'], userId })
    }
  }

  if (site.id === 'reelcn') {
    // The showcase journey: user_482, two weeks, two devices, signup, an error and outbound clicks.
    const phone = { anon: '01937a2e-a91f-7c3d-8e21-4f6b9d0c1a91', person: 'user_482', identified: true, country: 'IN', device: 'mobile', os: 'Android', browser: 'Chrome' }
    const laptop = { ...phone, anon: '01937b10-55d2-7e10-9a3c-77c1e2d4b502', device: 'desktop', os: 'Mac', browser: 'Chrome' }
    const d0 = startOfDay(now)
    session(phone, d0 - 7 * DAY + 11 * HOUR + 12 * MIN, {
      referrer: 'google.com',
      paths: ['/', '/docs/components', '/docs/components/tutorial'],
      extra: (push, t) => push({ type: 'error', ts: t, props: { message: ERRORS[0] } }),
    })
    // Day -4, phone: comes back from GitHub, signs up.
    session(phone, d0 - 4 * DAY + 21 * HOUR + 40 * MIN, {
      referrer: 'github.com',
      paths: ['/', '/pricing', '/signup'],
      identifyAt: 2,
      userId: 'user_482',
    })
    // Today, laptop: logs in from X, reads the launch post, downloads a template, clicks out.
    const lap = Math.min(now - 40 * MIN, d0 + 10 * HOUR + 5 * MIN)
    session(laptop, lap, {
      referrer: 'x.com',
      paths: ['/blog/launch-week', '/docs/components/data-story', '/templates/reel-starter'],
      identifyAt: 0,
      userId: 'user_482',
      extra: (push, t) => {
        push({ type: 'event', ts: t, name: 'Download Template', props: { template: 'reel-starter' } })
        push({ type: 'outbound', ts: t + 4000, props: { url: OUTBOUND[0] } })
      },
    })
  }

  // A few people on the site right now.
  for (let i = 0; i < (site.id === 'reelcn' ? 4 : 1); i++) {
    const anon = `0193${hex(r, 4)}-${hex(r, 4)}-7${hex(r, 3)}-${hex(r, 4)}-${hex(r, 12)}`
    session({ anon, person: anon, identified: false, country: i % 2 ? 'IN' : 'US', ...device(r) }, now - (1 + i) * MIN, { paths: ['/'] })
  }

  return out.sort((a, b) => a.ts - b.ts)
}

const cache = new Map<string, Ev[]>()
const NOW = Date.now()
function events(siteId: string): Ev[] {
  const site = SITES.find((s) => s.id === siteId) ?? SITES[0]
  let evs = cache.get(site.id)
  if (!evs) cache.set(site.id, (evs = generate(site, NOW)))
  return evs
}

const DIM_FIELD: Record<Dim, (e: Ev) => string> = {
  path: (e) => e.path,
  route: (e) => e.route,
  host: (e) => e.host,
  referrer: (e) => e.referrer,
  utm_source: (e) => e.utm_source,
  utm_medium: (e) => e.utm_medium,
  utm_campaign: (e) => e.utm_campaign,
  country: (e) => e.country,
  device: (e) => e.device,
  browser: (e) => e.browser,
  os: (e) => e.os,
  event: (e) => (e.type === 'event' ? e.name : ''),
}

function select(q: Query, from = q.from, to = q.to): Ev[] {
  // Row filters on every dim except `event`, which keeps whole sessions that fired it (as the server does).
  const fs = Object.entries(q.filters).filter(([d, v]) => v != null && d !== 'event') as [Dim, string][]
  const inRange = events(q.site).filter(
    (e) => e.ts >= from && e.ts <= to && (q.env === 'all' || e.env === q.env) && fs.every(([d, v]) => DIM_FIELD[d](e) === v),
  )
  const ev = q.filters.event
  if (ev == null) return inRange
  const sessions = new Set(inRange.filter((e) => e.type === 'event' && e.name === ev).map((e) => e.session))
  return inRange.filter((e) => sessions.has(e.session))
}

function totals(evs: Ev[]) {
  const persons = new Set<string>()
  const sessions = new Map<string, { pv: number; eng: number; ev: boolean }>()
  let pageviews = 0
  for (const e of evs) {
    persons.add(e.person)
    const s = sessions.get(e.session) ?? { pv: 0, eng: 0, ev: false }
    if (e.type === 'pageview') (pageviews++, s.pv++)
    if (e.type === 'engage') s.eng = Math.max(s.eng, e.engagedMs)
    if (e.type === 'event' || e.type === 'identify') s.ev = true
    sessions.set(e.session, s)
  }
  let engaged = 0
  for (const s of sessions.values()) if (s.pv >= 2 || s.eng >= 10_000 || s.ev) engaged++
  return { visitors: persons.size, pageviews, bounce: sessions.size ? 1 - engaged / sessions.size : 0 }
}

const delay = <T,>(v: T) => new Promise<T>((res) => setTimeout(() => res(v), 120 + Math.random() * 180))

export function sites() {
  return delay(SITES)
}

export function stats(q: Query): Promise<Stats> {
  const span = q.to - q.from
  const online = new Set(events(q.site).filter((e) => e.ts >= NOW - 5 * MIN).map((e) => e.anon)).size
  return delay({ ...totals(select(q)), prev: totals(select(q, q.from - span, q.from - 1)), online })
}

export function series(q: Query, metric: Metric): Promise<Series> {
  const bucket = q.to - q.from <= 48 * HOUR ? 'hour' : 'day'
  const floor = bucket === 'hour' ? startOfHour : (t: number) => startOfDay(t, TZ)
  const step = (t: number) => (bucket === 'hour' ? t + HOUR : startOfDay(t + DAY + 2 * HOUR, TZ))
  const groups = new Map<number, Ev[]>()
  for (let t = floor(q.from); t <= q.to; t = step(t)) groups.set(t, [])
  for (const e of select(q)) groups.get(floor(e.ts))?.push(e)
  const points = [...groups].map(([t, evs]) => ({ t, v: totals(evs)[metric] }))
  return delay({ bucket, points })
}

export function breakdown(q: Query, dim: Dim, search: string, limit: number): Promise<BreakdownRow[]> {
  const key = DIM_FIELD[dim]
  const rows = new Map<string, { persons: Set<string>; pageviews: number; total: number }>()
  for (const e of select(q)) {
    const k = key(e)
    if (!k || (search && !k.toLowerCase().includes(search.toLowerCase()))) continue
    const r = rows.get(k) ?? { persons: new Set(), pageviews: 0, total: 0 }
    r.persons.add(e.person)
    if (e.type === 'pageview') r.pageviews++
    if (dim === 'event') r.total++
    rows.set(k, r)
  }
  const out = [...rows].map(([k, r]) => ({ key: k, visitors: r.persons.size, pageviews: r.pageviews, total: r.total }))
  out.sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews || a.key.localeCompare(b.key))
  return delay(out.slice(0, limit))
}

export function visitors(q: Query, search: string, limit: number): Promise<Visitor[]> {
  const byPerson = new Map<string, Ev[]>()
  for (const e of select(q)) {
    if (search && !e.person.toLowerCase().includes(search.toLowerCase())) continue
    const xs = byPerson.get(e.person) ?? []
    xs.push(e)
    byPerson.set(e.person, xs)
  }
  const out: Visitor[] = [...byPerson].map(([person, evs]) => ({
    person,
    identified: evs[0].identified,
    firstSeen: evs[0].ts,
    lastSeen: evs[evs.length - 1].ts,
    visits: new Set(evs.map((e) => e.session)).size,
    country: evs[0].country,
    device: evs[0].device,
    source: evs[0].referrer || evs[0].utm_source || '',
  }))
  out.sort((a, b) => b.lastSeen - a.lastSeen)
  return delay(out.slice(0, limit))
}

export function journey(site: string, person: string): Promise<Session[]> {
  const bySession = new Map<string, Ev[]>()
  for (const e of events(site)) {
    if (e.person !== person) continue
    const xs = bySession.get(e.session) ?? []
    xs.push(e)
    bySession.set(e.session, xs)
  }
  const out: Session[] = [...bySession].map(([sessionId, evs]) => ({
    sessionId,
    start: evs[0].ts,
    source: evs[0].referrer || evs[0].utm_source || '',
    steps: evs.map((e) => ({
      ts: e.ts,
      type: e.type,
      path: e.path,
      name: e.type === 'pageview' || e.type === 'engage' ? '' : e.name,
      engagedMs: e.engagedMs,
      scrollPct: e.scrollPct,
      props: e.props,
    })),
  }))
  out.sort((a, b) => a.start - b.start)
  return delay(out)
}

// Goals: in-memory per site, validated like the server. `blog` starts empty to show the empty state.
const GOALS = new Map<string, Goal[]>([
  ['reelcn', [
    { id: 1, name: 'Signup', kind: 'event', match: 'Signup' },
    { id: 2, name: 'Viewed pricing', kind: 'page', match: '/pricing' },
    { id: 3, name: 'Read the docs', kind: 'page', match: '/docs/components/*' },
    { id: 4, name: 'Downloaded a template', kind: 'event', match: 'Download Template' },
  ]],
  ['notes', [{ id: 5, name: 'Viewed pricing', kind: 'page', match: '/pricing' }]],
  // Matches the demo backend's two seeded goals.
  ['demo', [
    { id: 6, name: 'Signup', kind: 'event', match: 'Signup' },
    { id: 7, name: 'Pricing', kind: 'page', match: '/pricing' },
  ]],
])
let nextGoal = 100

class MockHttpError extends Error {
  status = 400
}

export function goals(site: string): Promise<Goal[]> {
  return delay([...(GOALS.get(site) ?? [])])
}

export function createGoal(site: string, g: Omit<Goal, 'id'>): Promise<Goal> {
  const list = GOALS.get(site) ?? []
  const name = g.name.trim()
  if (!name || name.length > 60 || !g.match || g.match.length > 200 || (g.kind !== 'page' && g.kind !== 'event'))
    return Promise.reject(new MockHttpError('invalid goal'))
  if (list.some((x) => x.name === name)) return Promise.reject(new MockHttpError('a goal with that name already exists'))
  const goal = { ...g, name, id: nextGoal++ }
  GOALS.set(site, [...list, goal])
  return delay(goal)
}

export function deleteGoal(site: string, id: number): Promise<void> {
  GOALS.set(site, (GOALS.get(site) ?? []).filter((g) => g.id !== id))
  return delay(undefined)
}

function goalHits(g: Goal, evs: Ev[]): GoalStats & { all: number } {
  const prefix = g.kind === 'page' && g.match.endsWith('*') ? g.match.slice(0, -1) : null
  const hit = (e: Ev) =>
    g.kind === 'event'
      ? e.type === 'event' && e.name === g.match
      : e.type === 'pageview' && (prefix != null ? e.path.startsWith(prefix) : e.path === g.match)
  const persons = new Set<string>()
  let conversions = 0
  for (const e of evs) if (hit(e)) (conversions++, persons.add(e.person))
  const all = new Set(evs.map((e) => e.person)).size
  return { conversions, visitors: persons.size, rate: all ? persons.size / all : 0, all }
}

export function goalReport(q: Query): Promise<GoalRow[]> {
  const span = q.to - q.from
  const cur = select(q)
  const prev = select(q, q.from - span, q.from - 1)
  return delay(
    (GOALS.get(q.site) ?? []).map((g) => {
      const { all: _a, ...c } = goalHits(g, cur)
      const { all: _b, ...p } = goalHits(g, prev)
      return { ...g, ...c, prev: p }
    }),
  )
}

export function delivery(q: Query): Promise<Delivery> {
  const events = select(q).length
  // ~1.7% of events land on a retry in the fixture, a plausible mobile-heavy figure.
  const retried = Math.round(events * 0.017)
  return delay({ events, retried, retriedRate: events ? retried / events : 0 })
}
