// Pure geometry for the hand-drawn SVG charts (port of proto-d js/charts.js).
// Straight segments only: daily counts are discrete, a curve would invent values between buckets.
// A null value (an hour or day that has not happened) breaks the line; it is never drawn as zero.

const STEPS = [1, 2, 5, 10]

/** Axis ticks from 0 in steps of 1, 2 or 5 × 10^n, about five of them, the last at or above `max`. */
export function niceTicks(max: number, opts: { integer?: boolean } = {}): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1]
  const raw = max / 5
  const p = 10 ** Math.floor(Math.log10(raw))
  let step = STEPS.map((s) => s * p).find((s) => s >= raw - 1e-12) ?? 10 * p
  if (opts.integer && step < 1) step = 1
  const n = Math.max(1, Math.ceil(max / step - 1e-9))
  const digits = Math.max(0, -Math.floor(Math.log10(step)))
  return Array.from({ length: n + 1 }, (_, i) => Number((i * step).toFixed(digits)))
}

/** x position of point `i` of `n` across a plot `w` wide; a lone point sits in the middle. */
export function scaleX(i: number, n: number, w: number): number {
  return n <= 1 ? w / 2 : (i / (n - 1)) * w
}

/** An SVG path through the values, a new subpath after every null. */
export function pathFor(values: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      pen = false
      return
    }
    d += `${pen ? ' L' : d ? ' M' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
    pen = true
  })
  return d
}

/**
 * The running bucket (today so far, this hour so far) is drawn dotted from the bucket before it.
 * `solid` is the series without that bucket; `dotted` is the index pair of the dotted segment.
 */
export function todaySegment(values: readonly (number | null)[], lastBucket: number): { solid: (number | null)[]; dotted: [number, number] | null } {
  const solid = values.map((v, i) => (i === lastBucket ? null : v))
  const ok = lastBucket > 0 && values[lastBucket] != null && values[lastBucket - 1] != null
  return ok ? { solid, dotted: [lastBucket - 1, lastBucket] } : { solid: [...values], dotted: null }
}

export interface LaneMark {
  i: number // the bucket the mark sits on
  count: number
  from: number // first bucket it covers
  to: number // last bucket it covers
}

/**
 * The signup lane: one uniform mark per bucket with signups, its count printed above.
 * When buckets are narrower than 9 px the marks would merge into a bar, so they group by week.
 */
export function laneMarks(lane: readonly { i: number; count: number }[], pxPerBucket: number): { weekly: boolean; marks: LaneMark[] } {
  const weekly = pxPerBucket < 9
  if (!weekly) return { weekly, marks: lane.filter((l) => l.count > 0).map((l) => ({ i: l.i, count: l.count, from: l.i, to: l.i })) }
  const n = lane.reduce((m, l) => Math.max(m, l.i + 1), 0)
  const marks: LaneMark[] = []
  for (let w0 = 0; w0 < n; w0 += 7) {
    const to = Math.min(n - 1, w0 + 6)
    const count = lane.reduce((a, l) => (l.i >= w0 && l.i <= to ? a + l.count : a), 0)
    if (count > 0) marks.push({ i: Math.min(n - 1, w0 + 3), count, from: w0, to })
  }
  return { weekly, marks }
}

/** The bucket holding timestamp `ts` (points sorted by `t`), or -1 outside the series. */
export function bucketIndex(points: readonly { t: number }[], ts: number): number {
  if (!points.length || ts < points[0].t) return -1
  const step = points.length > 1 ? points[1].t - points[0].t : Infinity
  for (let i = points.length - 1; i >= 0; i--) {
    if (ts >= points[i].t) return i === points.length - 1 && ts >= points[i].t + step ? -1 : i
  }
  return -1
}
