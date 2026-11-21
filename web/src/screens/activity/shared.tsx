// Pieces shared by the Activity tabs, the journey sheet, the event sheet and Live.
import { Fragment, type ReactNode } from 'react'
import { apiQuery } from '../../state/url'
import { useUrlState } from '../../state/useUrlState'
import { viewerTz } from '../../shell/labels'
import { Avatar } from '../../ui/avatar'
import { api } from '../../api/client'

/** The API query for the current URL, its cache key, the viewer tz and whether this is a share link. */
export function useAq() {
  const s = useUrlState()
  const tz = viewerTz()
  const q = apiQuery(s, tz)
  return { s, q, tz, key: `${s.prefix}|${q.toString()}`, share: s.prefix.startsWith('/share/') }
}

/** "Came directly" for an empty or direct source. */
export function sourceText(src: string): string {
  return !src || src === '(direct)' || src === 'Direct' ? 'Came directly' : `Came from ${src}`
}
export function sourceLabel(src: string): string {
  return !src || src === '(direct)' || src === 'Direct' ? 'Direct' : src
}

export function CountryCode({ code }: { code: string }) {
  if (!code) return null
  return (
    <span className="cc" aria-hidden="true">
      {code.toUpperCase().slice(0, 2)}
    </span>
  )
}

export function Who({ seed, label, line, size = 28, badge }: { seed: string; label: string; line?: ReactNode; size?: 20 | 28 | 40; badge?: ReactNode }) {
  return (
    <div className="who">
      <Avatar seed={seed} size={size} />
      <div className="nm">
        <b data-testid="journey-label">{label}</b>
        {badge}
        {line != null && <span>{line}</span>}
      </div>
    </div>
  )
}

export function Feet() {
  return (
    <span className="ft" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

/** A row of steps joined with footsteps. "…" renders as a plain ellipsis. */
export function Trail({ steps, goal, first }: { steps: ReactNode[]; goal?: string; first?: 'src' }) {
  return (
    <span className="trail">
      {steps.map((x, i) => (
        <Fragment key={i}>
          {i > 0 && <Feet />}
          {x === '…' ? (
            <span className="more">…</span>
          ) : (
            <span className={`stp${i === 0 && first === 'src' ? ' src' : ''}`} title={typeof x === 'string' ? x : undefined}>
              {x}
            </span>
          )}
        </Fragment>
      ))}
      {goal && (
        <>
          <Feet />
          <span className="stp g">{goal}</span>
        </>
      )}
    </span>
  )
}

const dtFmts = new Map<string, Intl.DateTimeFormat>()
/** "Nov 12, 14:05" in the viewer's tz. */
export function dayTime(ms: number, tz: string): string {
  let f = dtFmts.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz })
    } catch {
      f = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
    }
    dtFmts.set(tz, f)
  }
  return f.format(ms)
}
const hmFmts = new Map<string, Intl.DateTimeFormat>()
/** "14:05" in the viewer's tz. */
export function hm(ms: number, tz: string): string {
  let f = hmFmts.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    } catch {
      f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
    }
    hmFmts.set(tz, f)
  }
  return f.format(ms)
}

export function StatStrip({ items, cols }: { items: { k: ReactNode; v: ReactNode; s?: ReactNode; testId?: string }[]; cols?: number }) {
  return (
    <div className="stat-strip" style={{ ['--cols' as string]: cols ?? items.length }}>
      {items.map((it, i) => (
        <div key={i}>
          <span className="k">{it.k}</span>
          <span className="v" data-testid={it.testId}>
            {it.v}
          </span>
          {it.s != null && <span className="s">{it.s}</span>}
        </div>
      ))}
    </div>
  )
}

/** The CSV export link for a list route, or undefined on share links (and when the client cannot build one). */
export function csvHref(path: string, q: URLSearchParams, share: boolean): string | undefined {
  if (share) return undefined
  try {
    return api.exportUrl(path, q, 'csv')
  } catch {
    return undefined
  }
}
