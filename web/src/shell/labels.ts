// Labels the shell shows for dims, values and ranges. Copy: sentence case; "Came directly".
import type { Dim, RangeKey } from '../api/types'

export const DIM_LABEL: Record<Dim, string> = {
  path: 'Page', route: 'Route', host: 'Host', entry: 'Entry page', exit: 'Exit page',
  referrer: 'Referrer', source: 'Source', channel: 'Channel', ai_source: 'AI source',
  utm_source: 'UTM source', utm_medium: 'UTM medium', utm_campaign: 'Campaign', utm_term: 'UTM term', utm_content: 'UTM content',
  country: 'Country', region: 'Region', city: 'City', device: 'Device', browser: 'Browser', os: 'OS',
  event: 'Event', goal: 'Goal', dow: 'Weekday', hour: 'Hour',
}
export const MONO_DIMS: ReadonlySet<Dim> = new Set<Dim>(['path', 'route', 'host', 'entry', 'exit', 'referrer'])

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function valueLabel(dim: Dim, value: string): string {
  if ((dim === 'source' || dim === 'referrer' || dim === 'channel') && (value === '' || value === '(direct)' || value === 'Direct')) return 'Came directly'
  if (dim === 'dow' && /^\d$/.test(value)) return DOW[Number(value)] ?? value
  if (dim === 'hour' && /^\d{1,2}$/.test(value)) return `${value.padStart(2, '0')}:00`
  return value
}

export const RANGE_GROUPS: { label: string; keys: RangeKey[] }[] = [
  { label: 'Days', keys: ['today', 'yesterday'] },
  { label: 'Calendar', keys: ['wtd', 'mtd', 'lastmonth'] },
  { label: 'Rolling', keys: ['7d', '30d', '90d', '12mo'] },
]
const RANGE_LABEL: Record<string, [string, string]> = {
  today: ['Today', 'Today'],
  yesterday: ['Yesterday', 'Yest.'],
  wtd: ['This week', 'Week'],
  mtd: ['This month', 'Month'],
  lastmonth: ['Last month', 'Last mo.'],
  '7d': ['Last 7 days', '7d'],
  '30d': ['Last 30 days', '30d'],
  '90d': ['Last 90 days', '90d'],
  '12mo': ['Last 12 months', '12mo'],
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function isoLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MON[m - 1] ?? ''} ${d}`
}

/** [long, short] label for a range key. */
export function rangeLabel(r: RangeKey): [string, string] {
  if (RANGE_LABEL[r]) return RANGE_LABEL[r]
  if (r.startsWith('d:')) {
    const l = isoLabel(r.slice(2))
    return [l, l]
  }
  if (r.startsWith('c:')) {
    const [a, b] = r.slice(2).split('~')
    const l = `${isoLabel(a)} – ${isoLabel(b)}`
    return [l, l]
  }
  return [r, r]
}

/** "Asia/Kolkata" → "Kolkata". */
export function tzCity(tz: string): string {
  const last = tz.split('/').pop() ?? tz
  return last.replace(/_/g, ' ')
}

export function viewerTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
