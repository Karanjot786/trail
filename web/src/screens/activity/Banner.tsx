// The Activity banner (plan Task F3-3): people over people. With a filter on it reads
// "129 · 25% of 525 visitors" (the filtered people over everyone in the range); without one, the count and the range.
import { api } from '../../api/client'
import type { Stats } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import { fmtInt, fmtPct } from '../../lib/format'
import { inWindow } from '../../lib/phrases'
import { apiQuery, reportSite } from '../../state/url'
import { useStats } from '../../shell/useStats'
import { useAq } from './shared'

export function bannerText(count: number, all: number | null, noun: string): string {
  if (all == null || all <= 0) return `${fmtInt(count)} ${noun}`
  return `${fmtInt(count)} · ${fmtPct(count / all)} of ${fmtInt(all)} ${noun}`
}

export function Banner({ count, filtered, loading, noun, of = 'visitors' }: { count: number; filtered: boolean; loading?: boolean; noun: string; of?: 'visitors' | 'sessions' }) {
  const { s } = useAq()
  const stats = useStats()
  const q = apiQuery({ ...s, filters: [] })
  const all = useQuery<Stats>(`stats|${q.toString()}|${s.prefix}`, async (sig) => api.stats(q, sig), { enabled: filtered && reportSite(s) })
  const w = stats.data?.window
  if (loading) return <p className="act-callout" aria-hidden="true">&nbsp;</p>
  return (
    <p className="act-callout" data-testid="activity-banner">
      {filtered ? (
        <span>
          <b>{bannerText(count, all.data?.[of] ?? null, noun)}</b> match the filters{w ? ` ${inWindow(w)}` : ''}.
        </span>
      ) : (
        <span>
          <b>{fmtInt(count)}</b> {noun} {w ? inWindow(w) : 'in this range'}. {of === 'sessions' ? 'Every row opens that visit in the person’s journey.' : 'Every row opens that person’s whole journey, across visits.'}
        </span>
      )}
    </p>
  )
}
