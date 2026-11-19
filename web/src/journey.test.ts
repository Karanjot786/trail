import { describe, expect, it } from 'vitest'
import type { Session, Step } from './api'
import { foldSteps, groupByDay } from './journey'

const IST = 'Asia/Kolkata'
// Unix ms for an IST wall-clock time (IST = UTC+5:30, no DST).
const ist = (y: number, mo: number, d: number, h: number, mi: number) => Date.UTC(y, mo - 1, d, h, mi) - 330 * 60_000

const session = (id: string, start: number): Session => ({ sessionId: id, start, source: '', steps: [] })
const step = (s: Partial<Step>): Step => ({ ts: 0, type: 'pageview', path: '/', name: '', engagedMs: 0, scrollPct: 0, props: {}, ...s })

describe('groupByDay', () => {
  it('puts sessions on Nov 12 and Nov 19 IST into two day groups, oldest first', () => {
    const g = groupByDay([session('b', ist(2026, 11, 19, 10, 0)), session('a', ist(2026, 11, 12, 9, 0))], IST)
    expect(g.map((x) => x.day)).toEqual(['2026-11-12', '2026-11-19'])
    expect(g[0].sessions.map((s) => s.sessionId)).toEqual(['a'])
    expect(g[1].label).toBe('Nov 19')
  })

  it('keeps a session starting at 23:50 IST on that IST day', () => {
    const g = groupByDay([session('late', ist(2026, 11, 12, 23, 50)), session('day', ist(2026, 11, 12, 8, 0))], IST)
    expect(g).toHaveLength(1)
    expect(g[0].day).toBe('2026-11-12')
    expect(g[0].sessions.map((s) => s.sessionId)).toEqual(['day', 'late'])
  })

  it('puts 00:10 IST on the IST day even though it is the previous UTC day', () => {
    const g = groupByDay([session('early', ist(2026, 11, 19, 0, 10))], IST)
    expect(g[0].day).toBe('2026-11-19')
  })

  it('returns [] for no sessions', () => {
    expect(groupByDay([], IST)).toEqual([])
  })
})

describe('foldSteps', () => {
  it('folds engage events into the preceding pageview (max engagedMs and scrollPct) and drops them', () => {
    const out = foldSteps([
      step({ ts: 1, path: '/' }),
      step({ ts: 2, type: 'engage', path: '/', engagedMs: 4000, scrollPct: 30 }),
      step({ ts: 3, type: 'engage', path: '/', engagedMs: 12000, scrollPct: 80 }),
      step({ ts: 4, path: '/pricing' }),
      step({ ts: 5, type: 'event', name: 'Signup' }),
    ])
    expect(out.map((s) => s.type)).toEqual(['pageview', 'pageview', 'event'])
    expect(out[0]).toMatchObject({ engagedMs: 12000, scrollPct: 80 })
  })

  it('keeps server-folded pageviews as they are', () => {
    const out = foldSteps([step({ ts: 1, engagedMs: 130000, scrollPct: 55 })])
    expect(out[0]).toMatchObject({ engagedMs: 130000, scrollPct: 55 })
  })
})
