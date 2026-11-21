import { describe, expect, it } from 'vitest'
import type { JourneySession, Step } from '../api/types'
import { dayIndex, foldSteps, gapText, goalBadge, goalMatches, rel, spanDays, stripLayout, tzOffset, visitsPhrase } from './journey'

const IST = 'Asia/Kolkata'
const NY = 'America/New_York'
// Unix ms for an IST wall-clock time (IST = UTC+5:30, no DST).
const ist = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 330 * 60_000

const step = (s: Partial<Step>): Step => ({ ts: 0, type: 'pageview', path: '/', name: '', engagedMs: 0, scrollPct: 0, props: {}, ...s })
const sess = (start: number, goals: JourneySession['goals'] = [], visit = 0): JourneySession => ({
  sessionId: `s${start}`, start, source: '', steps: [], visit, durationMs: 0, country: '', city: '', device: '', goals,
})

describe('tz days', () => {
  it('reads the IST offset', () => {
    expect(tzOffset(ist(2026, 11, 12, 9), IST)).toBe(330 * 60_000)
  })
  it('puts 00:10 IST on the IST day even though it is the previous UTC day', () => {
    expect(dayIndex(ist(2026, 11, 19, 0, 10), IST) - dayIndex(ist(2026, 11, 18, 23, 50), IST)).toBe(1)
  })
})

describe('spanDays', () => {
  it('counts calendar days in the viewer tz, both ends included', () => {
    expect(spanDays([sess(ist(2026, 11, 1, 23, 50)), sess(ist(2026, 11, 18, 0, 10))], IST)).toBe(18)
  })
  it('two visits 20 minutes apart across IST midnight span 2 days, but 1 day in New York', () => {
    const a = ist(2026, 11, 12, 23, 50)
    const b = ist(2026, 11, 13, 0, 10)
    expect(spanDays([sess(a), sess(b)], IST)).toBe(2)
    expect(spanDays([sess(a), sess(b)], NY)).toBe(1)
  })
  it('one visit is one day; none is zero', () => {
    expect(spanDays([sess(1)], IST)).toBe(1)
    expect(spanDays([], IST)).toBe(0)
  })
  it('phrases the header total', () => {
    expect(visitsPhrase(4, 18)).toBe('four visits over 18 days')
    expect(visitsPhrase(2, 1)).toBe('two visits on one day')
    expect(visitsPhrase(1, 1)).toBe('one visit')
  })
})

describe('goal badge', () => {
  it('comes from the data: two goals, each with the first visit that reached it', () => {
    const j = [
      sess(1000, [{ id: 2, name: 'Pricing', ts: 1100 }], 1),
      sess(5000, [{ id: 2, name: 'Pricing', ts: 5100 }], 2),
      sess(9000, [{ id: 7, name: 'Signup', ts: 9100 }], 3),
    ]
    expect(goalBadge(j)).toBe('2 goals: Pricing · visit 1, Signup · visit 3')
    expect(goalMatches(j).map((m) => m.count)).toEqual([2, 1])
  })
  it('one goal, and none', () => {
    expect(goalBadge([sess(1, [{ id: 1, name: 'Signup', ts: 2 }])])).toBe('Signup · visit 1')
    expect(goalBadge([sess(1)])).toBe('')
  })
})

describe('stripLayout', () => {
  const now = ist(2026, 11, 21, 12)
  it('stacks two visits on the same day into 2 lanes', () => {
    const l = stripLayout([ist(2026, 11, 20, 9), ist(2026, 11, 20, 15)], now, IST)
    expect(l.marks.map((m) => m.lane)).toEqual([0, 1])
    expect(l.lanes).toBe(2)
  })
  it('keeps far-apart visits on one lane and never runs past today', () => {
    const l = stripLayout([ist(2026, 10, 1, 9), ist(2026, 10, 20, 9), ist(2026, 11, 20, 9)], now, IST)
    expect(l.marks.every((m) => m.lane === 0)).toBe(true)
    expect(l.to).toBeLessThanOrEqual(ist(2026, 11, 22, 0))
    expect(l.marks.every((m) => m.left >= 0 && m.left <= 100)).toBe(true)
  })
})

describe('text', () => {
  it('writes gaps', () => {
    expect(gapText(9 * 86_400_000 + 12 * 3_600_000)).toBe('9 days, 12 hours later')
    expect(gapText(3 * 3_600_000 + 5 * 60_000)).toBe('3 hours, 5 minutes later')
    expect(gapText(60_000)).toBe('1 minute later')
  })
  it('writes relative times', () => {
    expect(rel(1000, 2000)).toBe('just now')
    expect(rel(0, 4 * 60_000)).toBe('4 min ago')
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
})
