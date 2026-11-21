// The freshness line (plan F1-5): "Updated 4s ago · Kolkata time · Every visit counted · 8,006 bot requests
// left out → · Changes are vs …". Offline: "As of 10:05 · not updating". Fixtures: "Sample data as of …".
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { fmtInt } from '../lib/format'
import { useUrlState } from '../state/useUrlState'
import { StatusDot } from '../ui/small'
import { RouteLink } from './RouteLink'
import { tzCity, viewerTz } from './labels'
import { useStats } from './useStats'
import { useDataMode } from './useDataMode'
import { useOnline } from './useOnline'

function hhmm(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(ms)
  } catch {
    return new Date(ms).toTimeString().slice(0, 5)
  }
}
function dayTime(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(ms)
  } catch {
    return new Date(ms).toISOString()
  }
}
function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)} h ago`
}

export function Freshness() {
  const s = useUrlState()
  const stats = useStats()
  const online = useOnline()
  const { mode, recordedAt } = useDataMode()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const tz = stats.data?.window?.tz || viewerTz()
  const at = stats.updatedAt
  const basis = stats.data?.window?.basis?.text ? stats.data.window.basis : undefined
  const bots = stats.data?.botRequests
  const frozen = !online || (stats.error != null && stats.data != null)
  const sep = (
    <span className="sep" aria-hidden="true">
      ·
    </span>
  )
  return (
    <p className="fresh" data-testid="freshness">
      <StatusDot tone={frozen ? 'off' : 'live'} />
      {mode === 'fixtures' ? (
        <span>Sample data as of {recordedAt ? dayTime(recordedAt, tz) : 'the recording'}</span>
      ) : frozen && at ? (
        <span>As of {hhmm(at, tz)} · not updating</span>
      ) : (
        <span>{at ? `Updated ${ago(now - at)}` : 'Loading…'}</span>
      )}
      {sep}
      <span>{tzCity(tz)} time</span>
      {sep}
      <span>Every visit counted</span>
      {bots != null && (
        <>
          {sep}
          <RouteLink patch={{ screen: 'crawlers', tab: '', id: null, sheet: null }}>
            {fmtInt(bots)} bot requests left out
            <ArrowRight size={12} aria-hidden="true" />
          </RouteLink>
        </>
      )}
      {basis && s.screen !== 'live' && (
        <>
          {sep}
          <span className="basis">Changes are {basis.none ? 'not compared' : basis.text}</span>
        </>
      )}
    </p>
  )
}
