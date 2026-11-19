// Time-zone helpers. Day buckets follow the server's TRAIL_TZ (default Asia/Kolkata).
export const TZ: string = import.meta.env.VITE_TZ || 'Asia/Kolkata'

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

const partsFmt = new Map<string, Intl.DateTimeFormat>()
function parts(ts: number, tz: string) {
  let f = partsFmt.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFmt.set(tz, f)
  }
  const o: Record<string, number> = {}
  for (const p of f.formatToParts(ts)) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

/** Offset of `tz` from UTC at instant `ts`, in ms. */
export function tzOffset(ts: number, tz = TZ): number {
  const p = parts(ts, tz)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUTC - Math.floor(ts / 1000) * 1000
}

/** Start of the calendar day containing `ts`, in `tz`. */
export function startOfDay(ts: number, tz = TZ): number {
  const off = tzOffset(ts, tz)
  const local = ts + off
  return local - (((local % DAY) + DAY) % DAY) - off
}

export function startOfHour(ts: number): number {
  return ts - (((ts % HOUR) + HOUR) % HOUR) // all supported zones have whole/half-hour offsets; IST is +5:30
}

/** "YYYY-MM-DD" key for the day containing `ts` in `tz`. */
export function dayKey(ts: number, tz = TZ): string {
  const p = parts(ts, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Unix ms of local midnight for a "YYYY-MM-DD" string in `tz`. */
export function dateToTs(date: string, tz = TZ): number {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  return guess - tzOffset(guess, tz)
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(opts: Intl.DateTimeFormatOptions, tz: string) {
  const k = JSON.stringify(opts) + tz
  let f = fmtCache.get(k)
  if (!f) fmtCache.set(k, (f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts })))
  return f
}

export const fmtDay = (ts: number, tz = TZ) => fmt({ month: 'short', day: 'numeric' }, tz).format(ts)
export const fmtTime = (ts: number, tz = TZ) =>
  fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, tz).format(ts)
export const fmtDateTime = (ts: number, tz = TZ) =>
  fmt({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, tz).format(ts)
export const fmtWeekday = (ts: number, tz = TZ) => fmt({ weekday: 'short' }, tz).format(ts)
