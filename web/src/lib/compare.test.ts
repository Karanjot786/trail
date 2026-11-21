import { describe, expect, it } from 'vitest'
import { compare, deltaLabel, MIN_BASE, type DeltaKind } from './compare'
import type { Basis } from '../api/types'

// The plan's §0.9 vectors. compare(7, 1) reads "6": the plain difference (plan ruling, see P0 report).
const vectors: [number | null, number | null, DeltaKind, 'up' | 'down' | 'flat', number | undefined, string, string, string, string][] = [
  [41, 22, 'count', 'up', undefined, 'pct', '86%', '+', 'good'],
  [7, 1, 'count', 'up', undefined, 'abs', '6', '+', 'good'],
  [5, 0, 'count', 'up', undefined, 'abs', '5 new', '+', 'good'],
  [0, 0, 'count', 'up', undefined, 'flat', 'no change', '', 'flat'],
  [0, 4000, 'money', 'up', undefined, 'none', 'no purchases', '', 'flat'],
  [0.45, 0.4, 'rate', 'down', 3, 'low', 'too little data', '', 'flat'],
  [0.458, 0.4, 'rate', 'down', 50, 'pts', '5.8 pt', '+', 'bad'],
  [61000, 60000, 'duration', 'up', 2, 'low', 'too little data', '', 'flat'],
  [10, null, 'count', 'up', undefined, 'none', 'no earlier data', '', 'flat'],
  [100, 99.8, 'count', 'up', undefined, 'flat', 'no change', '', 'flat'],
]

describe('compare', () => {
  it.each(vectors)('compare(%s, %s, %s, %s, %s) → %s %s', (cur, prev, kind, good, n, mode, text, sign, tone) => {
    const d = compare(cur, prev, kind, good, n)
    expect({ mode: d.mode, text: d.text, sign: d.sign, tone: d.tone }).toEqual({ mode, text, sign, tone })
  })

  it('MIN_BASE is 5', () => expect(MIN_BASE).toBe(5))

  it('falls with a minus sign and good tone when down is good', () => {
    const d = compare(30, 60, 'count', 'down')
    expect(d).toMatchObject({ mode: 'pct', text: '50%', sign: '−', tone: 'good', up: false })
  })

  it('never yields NaN or Infinity text', () => {
    for (const [c, p] of [[NaN, 3], [3, NaN], [Infinity, 2], [null, 4]] as [number | null, number | null][]) {
      expect(compare(c, p, 'count', 'up').text).not.toMatch(/NaN|Infinity/)
    }
  })

  it('money with an empty earlier period is new, not a percentage', () => {
    expect(compare(1900, 0, 'money', 'up')).toMatchObject({ mode: 'abs', text: 'new', sign: '+' })
  })

  it('flat goal reads flat tone either way', () => expect(compare(10, 50, 'count', 'flat').tone).toBe('flat'))
})

describe('deltaLabel', () => {
  const basis: Basis = { text: 'vs Wed, Nov 11 (the day before)', short: 'vs Nov 11', why: '', dates: 'Nov 11', custom: false, none: false }
  it('reads the basis out', () => {
    expect(deltaLabel(compare(41, 22, 'count', 'up'), basis)).toMatchObject({ pill: '+86%', sr: 'up 86% vs Wed, Nov 11 (the day before)' })
  })
  it('reads points in full', () => {
    expect(deltaLabel(compare(0.458, 0.4, 'rate', 'down', 50), basis).sr).toBe('up 5.8 points vs Wed, Nov 11 (the day before)')
  })
  it('explains a plain difference in the tip', () => {
    expect(deltaLabel(compare(7, 1, 'count', 'up'), basis).tip).toMatch(/^Vs Wed, Nov 11 \(the day before\)\. Too few/)
  })
  it('keeps flat states undirected', () => {
    expect(deltaLabel(compare(0, 0, 'count', 'up'), basis)).toMatchObject({ pill: 'no change', sr: 'no change, vs Wed, Nov 11 (the day before)' })
  })
})
