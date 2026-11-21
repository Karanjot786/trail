// Test fixtures for the Activity, journey, event and Live tests. Used by *.test.tsx only.
import { vi } from 'vitest'
import type { EventDetail, EventRow, Goal, GoalDetail, JourneySession, Live, PathsReport, Person, SessionRow, Stats } from '../../api/types'
import { stats as baseStats, site } from '../../shell/testkit'

export const IST = (d: number, h: number, m = 0) => Date.UTC(2026, 10, d, h, m) - 330 * 60_000

export function person(i: number, extra: Partial<Person> = {}): Person {
  return {
    person: `p${i}`, label: `Visitor ${i}`, identified: false, firstSeen: IST(1, 9), lastSeen: IST(20, 9), visits: 1 + (i % 4), visitsTotal: 1 + (i % 4), pages: 3, durationMs: 65_000,
    country: 'IN', region: 'MH', city: 'Pune', device: 'Desktop', browser: 'Chrome', os: 'macOS', source: i % 2 ? 'Google' : '', ...extra,
  }
}
export function sessionRow(i: number): SessionRow {
  return {
    sessionId: `s${i}`, person: `p${i}`, label: `Visitor ${i}`, start: IST(20, 9, i), durationMs: 30_000 + i * 1000, pages: 4, entry: '/', exit: '/pricing',
    source: 'Google', country: 'IN', city: 'Pune', device: 'Desktop', browser: 'Chrome', os: 'macOS', goals: [], revenueMinor: 0, agent: '',
  }
}
const pv = (ts: number, path: string) => ({ ts, type: 'pageview' as const, path, name: '', engagedMs: 20_000, scrollPct: 60, props: {} })
const ev = (ts: number, name: string) => ({ ts, type: 'event' as const, path: '/signup', name, engagedMs: 0, scrollPct: 0, props: { plan: 'free' } })

export function journey(): JourneySession[] {
  return [
    { sessionId: 'a', start: IST(2, 10), source: 'Google', visit: 1, durationMs: 120_000, country: 'IN', city: 'Pune', device: 'Desktop', agent: '', steps: [pv(IST(2, 10), '/'), pv(IST(2, 10, 1), '/pricing')], goals: [{ id: 2, name: 'Pricing', ts: IST(2, 10, 1) }] },
    { sessionId: 'b', start: IST(9, 11), source: '', visit: 2, durationMs: 60_000, country: 'IN', city: 'Pune', device: 'Desktop', agent: '', steps: [pv(IST(9, 11), '/docs')], goals: [] },
    { sessionId: 'c', start: IST(19, 18), source: 'Google', visit: 3, durationMs: 90_000, country: 'IN', city: 'Pune', device: 'Desktop', agent: '', steps: [pv(IST(19, 18), '/signup'), ev(IST(19, 18, 1), 'Signup')], goals: [{ id: 7, name: 'Signup', ts: IST(19, 18, 1) }] },
  ]
}

export const events: EventRow[] = [
  { name: 'Signup', kind: 'custom', count: 54, people: 50, lastSeen: IST(20, 9), props: [{ key: 'plan', distinct: 3, top: ['free'] }] },
  { name: 'Outbound link', kind: 'outbound', count: 12, people: 9, lastSeen: IST(20, 8), props: [{ key: 'url', distinct: 5, top: [] }] },
]
export function eventDetail(): EventDetail {
  return {
    name: 'Signup', count: 54, people: 50, prev: { count: 40, people: 38 }, series: [], prevSeries: [],
    props: [{ key: 'plan', rows: [{ value: 'free', count: 40, people: 38 }, { value: 'pro', count: 14, people: 12 }] }],
    latest: [{ ts: IST(20, 9), person: 'p3', label: 'Visitor 3', sessionId: 's3', props: { plan: 'free' } }],
  }
}
export const goals: Goal[] = [
  { id: 7, name: 'Signup', kind: 'event', match: 'Signup' },
  { id: 2, name: 'Pricing', kind: 'page', match: '/pricing' },
]
export const paths: PathsReport = {
  goal: goals[0], converters: 54,
  rows: [
    { steps: ['Google', '/', '/pricing'], people: 20, share: 0.37 },
    { steps: ['Came directly', '/docs', '…', '/signup'], people: 9, share: 0.17 },
  ],
}
export function goalDetail(): GoalDetail {
  return {
    goal: goals[0], cur: { conversions: 54, visitors: 525, rate: 0.1 }, prev: null, series: [], prevSeries: [], sources: [], landings: [],
    byVisit: { first: 30, second: 14, later: 10 },
  }
}
export function live(extra: Partial<Live> = {}): Live {
  return {
    asOf: IST(21, 10, 5), active: 6, events5m: 14,
    countries: [{ key: 'IN', count: 3 }, { key: 'US', count: 3 }, { key: 'DE', count: 1 }],
    sources: [{ key: 'Google', count: 4 }, { key: '', count: 2 }],
    pages: [{ key: '/', count: 2 }],
    stream: [{ ts: IST(21, 10, 4), person: 'p1', label: 'Visitor 1', sessionId: 's1', type: 'pageview', path: '/e2e-test-visit', name: '', country: 'IN', city: 'Pune', source: 'Google' }],
    streamTotal: 1,
    ...extra,
  }
}

export const state = { goals: goals as Goal[], journey: journey(), live: live() }

export function activityApi() {
  return {
    sites: vi.fn(async () => [site('demo')]),
    stats: vi.fn(async (): Promise<Stats> => ({ ...baseStats(), conv: { goalId: 7, name: 'Signup' } })),
    visitors: vi.fn(async (_q: URLSearchParams, o: { limit?: number } = {}) => {
      const rows = Array.from({ length: Math.min(o.limit ?? 50, 120) }, (_, i) => person(i))
      return { rows, total: 120 }
    }),
    sessions: vi.fn(async (_q: URLSearchParams, o: { person?: string; sort?: string } = {}) => {
      if (o.person) return { rows: [{ ...sessionRow(1), person: o.person, label: 'Visitor K7QD' }], total: 1 }
      return { rows: Array.from({ length: 5 }, (_, i) => sessionRow(i)), total: 5 }
    }),
    journey: vi.fn(async () => state.journey),
    events: vi.fn(async () => ({ rows: events, total: events.length })),
    eventDetail: vi.fn(async () => eventDetail()),
    goals: vi.fn(async () => state.goals),
    paths: vi.fn(async () => paths),
    goalDetail: vi.fn(async () => goalDetail()),
    live: vi.fn(async () => state.live),
    exportUrl: vi.fn(() => '/api/export.csv'),
  }
}
