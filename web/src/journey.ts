import type { Session, Step } from './api'
import { dayKey, fmtDay } from './time'

export interface DayGroup {
  day: string // YYYY-MM-DD in tz
  label: string // "Nov 12"
  sessions: Session[]
}

/** Group sessions by the calendar day their start falls on in `tz`, oldest day and session first. */
export function groupByDay(sessions: Session[], tz: string): DayGroup[] {
  const sorted = [...sessions].sort((a, b) => a.start - b.start)
  const groups: DayGroup[] = []
  for (const s of sorted) {
    const day = dayKey(s.start, tz)
    let g = groups[groups.length - 1]
    if (!g || g.day !== day) groups.push((g = { day, label: fmtDay(s.start, tz), sessions: [] }))
    g.sessions.push(s)
  }
  return groups
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
