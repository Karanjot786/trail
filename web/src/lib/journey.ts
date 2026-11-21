// Journey helpers (plan Task F3-2), moved from src/journey.ts. Calendar days are counted in the viewer's
// time zone; goal matches come from the server's `JourneySession.goals`, so the header badge and the step
// chips are built from the same data and cannot disagree.
import type { GoalHit, JourneySession, Step } from '../api/types'

export const DAY = 86_400_000
const HOUR = 3_600_000
const MIN = 60_000

const offFmts = new Map<string, Intl.DateTimeFormat>()
/** The zone's offset from UTC at `ms`, in ms (IST → +19 800 000). */
export function tzOffset(ms: number, tz: string): number {
  let f = offFmts.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    } catch {
      f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    }
    offFmts.set(tz, f)
  }
  const p: Record<string, number> = {}
  for (const x of f.formatToParts(ms)) if (x.type !== 'literal') p[x.type] = Number(x.value)
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return wall - Math.floor(ms / 1000) * 1000
}

/** A day number for the calendar day `ms` falls on in `tz` (days since 1970-01-01 on that calendar). */
export function dayIndex(ms: number, tz: string): number {
  return Math.floor((ms + tzOffset(ms, tz)) / DAY)
}

/** The instant the calendar day of `ms` starts in `tz`. */
export function startOfDay(ms: number, tz: string): number {
  const off = tzOffset(ms, tz)
  return Math.floor((ms + off) / DAY) * DAY - off
}

/** Calendar days from the first visit to the last, both included, in `tz`. One visit → 1. */
export function spanDays(sessions: Pick<JourneySession, 'start'>[], tz: string): number {
  if (!sessions.length) return 0
  const starts = sessions.map((s) => s.start)
  return dayIndex(Math.max(...starts), tz) - dayIndex(Math.min(...starts), tz) + 1
}

/** "four visits over 18 days", "two visits on one day", "one visit". */
export function visitsPhrase(visits: number, days: number): string {
  const n = numberWord(visits)
  const v = `${n} ${visits === 1 ? 'visit' : 'visits'}`
  if (visits <= 1) return v
  return days <= 1 ? `${v} on one day` : `${v} over ${days} days`
}
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export function numberWord(n: number): string {
  return WORDS[n] ?? n.toLocaleString('en-US')
}

/** The 1-based visit number of a session in this journey (the server's, else its position). */
export function visitNo(s: JourneySession, i: number): number {
  return s.visit > 0 ? s.visit : i + 1
}

export interface GoalMatch {
  id: number
  name: string
  /** The first visit that reached it. */
  visit: number
  count: number
}
/** Each goal reached in the journey, in the order first reached. */
export function goalMatches(sessions: JourneySession[]): GoalMatch[] {
  const out = new Map<number, GoalMatch & { ts: number }>()
  sessions.forEach((s, i) => {
    for (const g of s.goals ?? []) {
      const m = out.get(g.id)
      if (m) {
        m.count++
        if (g.ts < m.ts) Object.assign(m, { ts: g.ts, visit: visitNo(s, i) })
      } else out.set(g.id, { id: g.id, name: g.name, visit: visitNo(s, i), count: 1, ts: g.ts })
    }
  })
  return [...out.values()].sort((a, b) => a.ts - b.ts).map(({ ts: _ts, ...m }) => m)
}

/** "" · "Signup · visit 1" · "2 goals: Pricing · visit 1, Signup · visit 3". */
export function goalBadge(sessions: JourneySession[]): string {
  const m = goalMatches(sessions)
  if (!m.length) return ''
  const parts = m.map((g) => `${g.name} · visit ${g.visit}`)
  return m.length === 1 ? parts[0] : `${m.length} goals: ${parts.join(', ')}`
}

/** The goal hits that happened on this step (same timestamp), for the step's chips. */
export function hitsAt(s: JourneySession, st: Step): GoalHit[] {
  return (s.goals ?? []).filter((g) => g.ts === st.ts)
}

export interface StripMark {
  index: number
  left: number // % of the axis
  lane: number
  anchor: 'start' | 'mid' | 'end'
}
export interface StripLayout {
  from: number
  to: number
  marks: StripMark[]
  lanes: number
}
const LANE_GAP = 16 // visits closer than this % of the axis stack into lanes
const MIN_DAYS = 15

/** The visits strip: a day axis from the day before the first visit, at least 15 days, ending at today at most. */
export function stripLayout(starts: number[], now: number, tz: string): StripLayout {
  if (!starts.length) return { from: now - MIN_DAYS * DAY, to: now, marks: [], lanes: 1 }
  const first = Math.min(...starts)
  const last = Math.max(...starts)
  const today = startOfDay(now, tz) + DAY
  let from = startOfDay(first, tz) - DAY
  let to = Math.min(today, Math.max(startOfDay(last, tz) + 2 * DAY, from + MIN_DAYS * DAY))
  to = Math.max(to, last + 1)
  if (to - from < MIN_DAYS * DAY) from = to - MIN_DAYS * DAY
  const laneEnd: number[] = []
  const marks = starts.map((t, index) => {
    const left = ((t - from) / (to - from)) * 100
    let lane = 0
    while (laneEnd[lane] != null && left - laneEnd[lane] < LANE_GAP) lane++
    laneEnd[lane] = left
    return { index, left, lane: Math.min(2, lane), anchor: (left > 86 ? 'end' : left < 8 ? 'start' : 'mid') as StripMark['anchor'] }
  })
  return { from, to, marks, lanes: Math.min(3, Math.max(1, laneEnd.length)) }
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** "9 days, 12 hours later", "3 hours, 5 minutes later", "12 minutes later", "moments later". */
export function gapText(ms: number, word = 'later'): string {
  const d = Math.floor(ms / DAY)
  const h = Math.floor((ms % DAY) / HOUR)
  const m = Math.floor((ms % HOUR) / MIN)
  if (d > 0) return `${plural(d, 'day')}${h ? `, ${plural(h, 'hour')}` : ''} ${word}`
  if (h > 0) return `${plural(h, 'hour')}${m ? `, ${plural(m, 'minute')}` : ''} ${word}`
  if (m > 0) return `${plural(m, 'minute')} ${word}`
  return `moments ${word}`
}

/** "just now", "4 min ago", "3 h ago", "2 days ago". */
export function rel(ts: number, now = Date.now()): string {
  const d = Math.max(0, now - ts)
  if (d < MIN) return 'just now'
  if (d < HOUR) return `${Math.floor(d / MIN)} min ago`
  if (d < DAY) return `${Math.floor(d / HOUR)} h ago`
  const days = Math.floor(d / DAY)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/**
 * Fold raw `engage` steps into the pageview they follow (max engagedMs / scrollPct) and drop them.
 * Idempotent for a server that already folded them.
 */
export function foldSteps(steps: Step[]): Step[] {
  const out: Step[] = []
  let page: Step | null = null
  for (const s of [...steps].sort((a, b) => a.ts - b.ts)) {
    if (s.type === 'engage') {
      if (page) {
        page.engagedMs = Math.max(page.engagedMs, s.engagedMs)
        page.scrollPct = Math.max(page.scrollPct, s.scrollPct)
      }
      continue
    }
    const copy = { ...s }
    if (copy.type === 'pageview') page = copy
    out.push(copy)
  }
  return out
}

/** The session's end: its last step, plus the last page's engaged time. */
export function sessionEnd(s: JourneySession): number {
  return Math.max(s.start + (s.durationMs || 0), ...s.steps.map((x) => x.ts))
}
