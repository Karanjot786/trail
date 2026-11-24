// State banners (plan F1-5, F1-8): offline, refresh failed (kept above the greyed last good data), stale,
// the read-only share notice, an expired or revoked share link, and the fixtures preset fallback.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Clock, Eye, Info, TriangleAlert, WifiOff } from 'lucide-react'
import { onGone } from '../api/useQuery'
import { useUrlState } from '../state/useUrlState'
import { Button } from '../ui/button'
import { useSite } from './useSite'
import { useStats } from './useStats'
import { useOnline } from './useOnline'
import { useDataMode } from './useDataMode'
import { tzCity } from './labels'
import { hhmm } from './Freshness'
import { useReportTz } from './useReportTz'

let gone = false
const goneListeners = new Set<() => void>()
onGone(() => {
  if (gone) return
  gone = true
  goneListeners.forEach((f) => f())
})
/** True once any request answered 410: the share link expired or was revoked. */
export function useGone(): boolean {
  return useSyncExternalStore(
    (f) => (goneListeners.add(f), () => void goneListeners.delete(f)),
    () => gone,
    () => gone,
  )
}
/** For tests. */
export function resetGone(): void {
  gone = false
  goneListeners.forEach((f) => f())
}

export function Banners() {
  const tz = useReportTz()
  const s = useUrlState()
  const { site, share } = useSite()
  const online = useOnline()
  const stats = useStats()
  const isGone = useGone()
  const { preset, presetLabel } = useDataMode()
  const isShare = s.prefix.startsWith('/share/')

  useEffect(() => {
    document.documentElement.classList.toggle('is-offline', !online)
  }, [online])

  // `stale` is computed from the clock at render time; tick so it flips without other activity.
  const [, tick] = useState(0)
  const hasData = stats.updatedAt != null
  useEffect(() => {
    if (!hasData) return
    const id = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [hasData])

  const failed = stats.error != null && stats.data != null && online
  const stale = stats.stale && !failed && online
  useEffect(() => {
    document.documentElement.classList.toggle('is-stale', failed)
  }, [failed])

  const items = []
  // A gone share link says so once, as the page's empty state (Shell); no banner repeats it.
  if (isShare && !isGone)
    items.push(
      <div key="share" className="notice" role="status">
        <Eye size={14} aria-hidden="true" />
        <span>
          <b>Read-only link</b>
          {` of ${share?.site.domain ?? site?.domain ?? 'this site'}. The range${s.filters.length ? ` and ${s.filters.length === 1 ? 'filter' : `${s.filters.length} filters`}` : ''} are part of the link. Visitors appear with stand-in names.${share?.hideRevenue || s.hideRevenue ? ' Revenue is hidden.' : ''}`}
        </span>
      </div>,
    )
  if (!online)
    items.push(
      <div key="off" className="notice" data-tone="warn" role="status">
        <WifiOff size={14} aria-hidden="true" />
        <span>
          <b>You are offline.</b> Live is paused{stats.updatedAt ? ` and the numbers below are from ${hhmm(stats.updatedAt, tz)}` : ''}. Trail reconnects by itself.
        </span>
        <span className="spacer" />
        <Button size="sm" onClick={() => stats.refetch()}>
          Try now
        </Button>
      </div>,
    )
  else if (failed)
    items.push(
      <div key="fail" className="notice" data-tone="bad" role="alert">
        <TriangleAlert size={14} aria-hidden="true" />
        <span>
          <b>Refresh failed.</b> These numbers are from {stats.updatedAt ? hhmm(stats.updatedAt, tz) : 'earlier'} and may be out of date; they stay greyed until Trail can refresh. Nothing is lost:
          events are still being recorded.
        </span>
        <span className="spacer" />
        <Button size="sm" onClick={() => stats.refetch()}>
          Try again
        </Button>
      </div>,
    )
  else if (stale)
    items.push(
      <div key="stale" className="notice" data-tone="warn" role="status">
        <Clock size={14} aria-hidden="true" />
        <span>These numbers are more than 10 minutes old.</span>
        <span className="spacer" />
        <Button size="sm" onClick={() => stats.refetch()}>
          Refresh
        </Button>
      </div>,
    )
  if (preset)
    items.push(
      <div key="preset" className="notice" role="status">
        <Info size={14} aria-hidden="true" />
        <span>
          The demo shows preset views. This one is not recorded, so you see {presetLabel || 'a nearby view'} instead.
        </span>
      </div>,
    )
  if (!items.length) return null
  return (
    <div className="banners" role="region" aria-label="Notices">
      {items}
    </div>
  )
}

/** The note for an unknown `range=` or a window clamped to the data start. */
export function RangeNote({ invalid }: { invalid: string | null }) {
  const stats = useStats()
  const tz = useReportTz()
  const w = stats.data?.window
  const msg = invalid
    ? `“${invalid}” is not a range Trail knows, so this shows the last 30 days.`
    : w?.invalid
      ? `“${w.invalid}” is not a range Trail knows, so this shows ${w.label.toLowerCase()}.`
      : w?.clamped
        ? `Data starts later than this range, so the numbers begin at the first event (${tzCity(w.tz || tz)} time).`
        : null
  if (!msg) return null
  return (
    <p className="range-note" role="note">
      <Info size={14} aria-hidden="true" />
      {msg}
    </p>
  )
}
