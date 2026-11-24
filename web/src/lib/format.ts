// Number, money, duration and date formatting for dashboard v3 (plan §0.9). Frozen after P0.
// Every function returns readable text for NaN/Infinity input: never "NaN".

const ok = (x: number) => (Number.isFinite(x) ? x : 0)
const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function fmtInt(n: number): string {
  return intFmt.format(Math.round(ok(n)))
}

/** A 0–1 fraction as a whole percentage: 0.4567 → "46%". */
export function fmtPct(f: number): string {
  return `${Math.round(ok(f) * 100)}%`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 65000 → "1m 05s", 0 → "0s", 3725000 → "1h 02m". */
export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ok(ms) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${pad(s % 60)}s`
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`
}

const moneyFmts = new Map<string, Intl.NumberFormat>()
function moneyFmt(currency: string, cents: boolean): Intl.NumberFormat {
  const key = `${currency}:${cents}`
  let f = moneyFmts.get(key)
  if (!f) {
    try {
      const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
      f = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: cents ? digits : 0, maximumFractionDigits: cents ? digits : 0 })
    } catch {
      f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
    }
    moneyFmts.set(key, f)
  }
  return f
}

/** Minor units → "$19" or "$19.50". The currency's own exponent decides the minor unit (JPY has none). */
export function fmtMoney(minor: number, currency: string): string {
  const cur = (currency || 'USD').toUpperCase()
  let exp = 2
  try {
    exp = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    /* unknown code: treat as cents */
  }
  const m = Math.round(ok(minor))
  const scale = 10 ** exp
  return moneyFmt(cur, m % scale !== 0).format(m / scale)
}

const dayFmts = new Map<string, Intl.DateTimeFormat>()
function dtf(tz: string, opts: Intl.DateTimeFormatOptions, tag: string): Intl.DateTimeFormat {
  const key = `${tag}|${tz}`
  let f = dayFmts.get(key)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz })
    } catch {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' })
    }
    dayFmts.set(key, f)
  }
  return f
}

/** "Thu, Nov 12" in the viewer's time zone. */
export function fmtDay(ms: number, tz: string): string {
  return dtf(tz, { weekday: 'short', month: 'short', day: 'numeric' }, 'day').format(ok(ms))
}

/** "Nov 12", the short day label used in ranges and chart axes. */
export function fmtShortDay(ms: number, tz: string): string {
  return dtf(tz, { month: 'short', day: 'numeric' }, 'short').format(ok(ms))
}

/** "Nov 9 – Nov 13", or "Nov 9" when both ends fall on the same day. */
export function fmtRange(from: number, to: number, tz: string): string {
  const a = fmtShortDay(from, tz)
  const b = fmtShortDay(to, tz)
  return a === b ? a : `${a} – ${b}`
}

/** "2026-11-12" for a timestamp in the given zone. */
export function dayIso(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(ms)
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

/** Today's date as "2026-11-12" in the given zone. */
export function todayIso(tz: string): string {
  return dayIso(Date.now(), tz)
}
