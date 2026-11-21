// Sentence fragments that name a window (plan §0.9). Frozen after P0.
import type { Window } from '../api/types'
import { fmtDay, fmtShortDay } from './format'

const ROLLING: Record<string, string> = {
  today: 'today',
  yesterday: 'yesterday',
  wtd: 'this week',
  mtd: 'this month',
  lastmonth: 'last month',
  '7d': 'in the last 7 days',
  '30d': 'in the last 30 days',
  '90d': 'in the last 90 days',
  '12mo': 'in the last 12 months',
}

// A calendar date written in the key is formatted at UTC noon, so no time zone can move it to another day.
const isoNoon = (iso: string) => Date.parse(`${iso}T12:00:00Z`)

/** "today", "in the last 30 days", "on Thu, Nov 12", "from Nov 1 to Nov 5". */
export function inWindow(w: Pick<Window, 'key'>): string {
  const k = w.key
  if (ROLLING[k]) return ROLLING[k]
  let m = /^d:(\d{4}-\d{2}-\d{2})$/.exec(k)
  if (m) return `on ${fmtDay(isoNoon(m[1]), 'UTC')}`
  m = /^c:(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(k)
  if (m) return `from ${fmtShortDay(isoNoon(m[1]), 'UTC')} to ${fmtShortDay(isoNoon(m[2]), 'UTC')}`
  return 'in this period'
}
