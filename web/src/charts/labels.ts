import type { Window } from '../api/types'
import { fmtDur, fmtInt, fmtMoney, fmtPct, fmtShortDay } from '../lib/format'

const hourFmts = new Map<string, Intl.DateTimeFormat>()
function hourFmt(tz: string): Intl.DateTimeFormat {
  let f = hourFmts.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz })
    } catch {
      f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
    }
    hourFmts.set(tz, f)
  }
  return f
}

/** "14:00" in the window's time zone. */
export function fmtHour(ms: number, tz: string): string {
  return hourFmt(tz).format(ms)
}

/** The x-axis label of a bucket: "Nov 12" for days, "14:00" for hours. */
export function bucketLabel(t: number, w: Pick<Window, 'bucket' | 'tz'>): string {
  return w.bucket === 'hour' ? fmtHour(t, w.tz) : fmtShortDay(t, w.tz)
}

export type ValueKind = 'count' | 'rate' | 'duration' | 'money'

/** Axis and value text per kind: rates are 0–1 fractions, durations ms, money minor units. */
export function fmtValue(v: number, kind: ValueKind, currency = 'USD'): string {
  if (kind === 'rate') return fmtPct(v)
  if (kind === 'duration') return fmtDur(v)
  if (kind === 'money') return fmtMoney(v, currency)
  return fmtInt(v)
}
