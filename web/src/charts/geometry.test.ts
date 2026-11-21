import { describe, expect, it } from 'vitest'
import { bucketIndex, laneMarks, niceTicks, pathFor, scaleX, todaySegment } from './geometry'

describe('niceTicks', () => {
  it('steps by 1, 2 or 5 × 10^n and reaches past the max', () => {
    expect(niceTicks(41)).toEqual([0, 10, 20, 30, 40, 50])
    expect(niceTicks(3)).toEqual([0, 1, 2, 3])
    expect(niceTicks(1000)).toEqual([0, 200, 400, 600, 800, 1000])
  })
  it('never returns an empty or flat axis', () => {
    expect(niceTicks(0)).toEqual([0, 1])
    expect(niceTicks(Number.NaN)).toEqual([0, 1])
  })
  it('keeps whole steps for counts and allows fractions for rates', () => {
    expect(niceTicks(2, { integer: true })).toEqual([0, 1, 2])
    expect(niceTicks(0.42)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5])
  })
})

describe('scaleX', () => {
  it('spreads points from 0 to w and centres a single point', () => {
    expect(scaleX(0, 5, 400)).toBe(0)
    expect(scaleX(4, 5, 400)).toBe(400)
    expect(scaleX(0, 1, 400)).toBe(200)
  })
})

describe('pathFor', () => {
  const x = (i: number) => i * 10
  const y = (v: number) => 100 - v
  it('breaks the line at a null instead of dropping to zero', () => {
    const d = pathFor([1, 2, 3, null, 5, 6], x, y)
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d).not.toContain('100.0')
  })
  it('draws straight segments only, never curves', () => {
    expect(pathFor([1, 2, 3], x, y)).toBe('M0.0 99.0 L10.0 98.0 L20.0 97.0')
  })
  it('returns an empty path for no values', () => {
    expect(pathFor([null, null], x, y)).toBe('')
  })
})

describe('todaySegment', () => {
  it('moves the running bucket out of the solid line into a dotted pair', () => {
    const r = todaySegment([1, 2, 3, null], 2)
    expect(r.solid).toEqual([1, 2, null, null])
    expect(r.dotted).toEqual([1, 2])
  })
  it('has no dotted part without a previous point', () => {
    expect(todaySegment([4, null], 0).dotted).toBeNull()
    expect(todaySegment([4, null, 3], 2).dotted).toBeNull()
  })
})

describe('laneMarks', () => {
  const lane = Array.from({ length: 30 }, (_, i) => ({ i, count: i % 3 === 0 ? 1 : 0 }))
  it('keeps one mark per bucket when buckets are wide enough', () => {
    const m = laneMarks(lane, 12)
    expect(m.weekly).toBe(false)
    expect(m.marks).toHaveLength(10)
    expect(m.marks[0]).toMatchObject({ i: 0, count: 1, from: 0, to: 0 })
  })
  it('groups by week when a bucket is under 9 px', () => {
    const m = laneMarks(lane, 8)
    expect(m.weekly).toBe(true)
    expect(m.marks[0]).toMatchObject({ i: 3, from: 0, to: 6, count: 3 })
    expect(m.marks.reduce((a, g) => a + g.count, 0)).toBe(10)
  })
})

describe('bucketIndex', () => {
  const pts = [{ t: 0 }, { t: 100 }, { t: 200 }]
  it('finds the bucket that holds a timestamp', () => {
    expect(bucketIndex(pts, 150)).toBe(1)
    expect(bucketIndex(pts, 200)).toBe(2)
    expect(bucketIndex(pts, 250)).toBe(2)
    expect(bucketIndex(pts, -1)).toBe(-1)
    expect(bucketIndex(pts, 400)).toBe(-1)
  })
})
