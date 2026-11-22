import { describe, expect, it } from 'vitest'
import { playhead, simulateLive } from './liveSim'
import type { Live, LiveEvent } from './types'

const asOf = 1_763_700_000_000
const MIN = 60_000
function ev(minAgo: number, person: string, country = 'IN', source = 'Google', path = '/'): LiveEvent {
  return { ts: asOf - minAgo * MIN, person, label: person, sessionId: `s_${person}`, type: 'pageview', path, name: '', country, city: '', source }
}
// Recorded minutes before asOf. The playhead starts at 25 min before asOf.
const recorded: Live = {
  asOf,
  active: 0,
  events5m: 0,
  countries: [],
  sources: [],
  pages: [],
  stream: [ev(29.5, 'old'), ev(29, 'a'), ev(27, 'b', 'US', 'Direct', '/docs'), ev(25.5, 'c'), ev(24.5, 'd', 'DE'), ev(2, 'z')],
  streamTotal: 6,
}

describe('simulateLive', () => {
  it('keeps the last 5 minutes before the playhead, ending at now, and recounts', () => {
    const l = simulateLive(recorded, asOf)
    expect(l.asOf).toBe(asOf)
    expect(l.stream.map((e) => e.person)).toEqual(['c', 'b', 'a', 'old'])
    expect(l.stream[0].ts).toBe(asOf - 0.5 * MIN)
    expect(l.active).toBe(4)
    expect(l.events5m).toBe(4)
    expect(l.countries).toEqual([
      { key: 'IN', count: 3 },
      { key: 'US', count: 1 },
    ])
    expect(l.pages.map((p) => p.key)).toEqual(['/', '/docs'])
  })

  it('at asOf + 60 s every timestamp moves by 60 s against the recording and the window slides', () => {
    const now = asOf + MIN
    const l = simulateLive(recorded, now)
    // The playhead moved 1 min: d enters; old and a are now 5 min old or more and leave.
    expect(l.stream.map((e) => e.person)).toEqual(['d', 'c', 'b'])
    const shift = now - playhead(asOf, now)
    for (const e of l.stream) expect(e.ts).toBe(recorded.stream.find((r) => r.person === e.person)!.ts + shift)
    // A shown event keeps its timestamp between polls, so it ages.
    const before = simulateLive(recorded, asOf).stream.find((e) => e.person === 'c')!.ts
    expect(l.stream.find((e) => e.person === 'c')!.ts).toBe(before)
    expect(l.active).toBe(3)
    expect(l.countries.find((c) => c.key === 'DE')?.count).toBe(1)
  })

  it('numbers change between polls and the replay loops', () => {
    const a = simulateLive(recorded, asOf + 5_000)
    const b = simulateLive(recorded, asOf + 24 * MIN)
    expect(a.events5m).not.toBe(b.events5m)
    expect(b.stream.map((e) => e.person)).toContain('z')
    const looped = simulateLive(recorded, asOf + 25 * MIN)
    expect(looped.stream.map((e) => e.person)).toEqual(simulateLive(recorded, asOf).stream.map((e) => e.person))
  })

  it('repeats a recording shorter than the span, so Live is never empty mid-loop', () => {
    const short: Live = { ...recorded, stream: [ev(0.2, 'p'), ev(1.5, 'q'), ev(3.9, 'r')], streamTotal: 3 }
    for (let m = 0; m < 25; m++) {
      const l = simulateLive(short, asOf + m * MIN)
      expect(l.events5m).toBeGreaterThan(0)
      expect(l.active).toBeGreaterThan(0)
    }
  })
})
