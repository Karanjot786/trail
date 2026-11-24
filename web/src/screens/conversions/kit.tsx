// Shared pieces of the F4 screens (Acquisition, Conversions, Revenue, AI crawlers): the report query hook,
// page tabs, the stat strip, the one-rule bar cell and the calm stale state. Look: proto-d `.stat-strip`,
// `.page-tabs`, `.share-bar`, `.lede`, `.method`.
import type { CSSProperties, ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useQuery, type QueryResult } from '../../api/useQuery'
import { bar } from '../../lib/bar'
import { apiQuery, type UrlState } from '../../state/url'
import { useUrlState, type Patch } from '../../state/useUrlState'
import { RouteLink } from '../../shell/RouteLink'
import { EmptyState } from '../../ui/states'
import './kit.css'

/** A report read keyed by the URL's API query (site, range, cmp, env, tz, filters) plus `name`. */
export function useReport<T>(
  name: string,
  fn: (q: URLSearchParams, signal: AbortSignal) => Promise<T>,
  opts: { enabled?: boolean; dropGoal?: boolean } = {},
): QueryResult<T> & { q: URLSearchParams; s: UrlState } {
  const s = useUrlState()
  const q = opts.dropGoal ? dropGoalFilter(apiQuery(s)) : apiQuery(s)
  const r = useQuery<T>(`f4|${name}|${q.toString()}|${s.prefix}`, (sig) => fn(q, sig), { enabled: (opts.enabled ?? true) && !!s.site })
  return { ...r, q, s }
}

/** Goal reports ignore a goal filter, so a rate never turns into "100% of the people who converted". */
export function dropGoalFilter(q: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(q)
  const keep = p.getAll('f').filter((f) => !f.startsWith('goal:'))
  p.delete('f')
  keep.forEach((f) => p.append('f', f))
  return p
}

export interface PageTab {
  value: string
  label: string
  count?: number | string
  patch: Patch
}
/** Screen-level tabs: real links (the URL holds the tab), so Back undoes a switch. */
export function PageTabs({ items, value, label }: { items: PageTab[]; value: string; label: string }) {
  return (
    <div className="page-tabs">
      <nav className="tabs tabs-lg" aria-label={label}>
        {items.map((t) => (
          <RouteLink key={t.value} className="tab" patch={t.patch} aria-current={t.value === value ? 'page' : undefined} data-on={t.value === value || undefined}>
            {t.label}
            {t.count != null && <span className="n">{t.count}</span>}
          </RouteLink>
        ))}
      </nav>
    </div>
  )
}

export function StatStrip({ children, label, n }: { children: ReactNode; label?: string; n?: number }) {
  return (
    <div className="stat-strip" role={label ? 'group' : undefined} aria-label={label} style={n ? ({ ['--n' as string]: n, ['--cols' as string]: n } as CSSProperties) : undefined}>
      {children}
    </div>
  )
}
export function Stat({ k, v, s, hint }: { k: ReactNode; v: ReactNode; s?: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <span className="k">
        {k}
        {hint}
      </span>
      <span className="v">{v}</span>
      {s != null && <span className="s">{s}</span>}
    </div>
  )
}

/** The one bar rule: value / max of this list, drawn with scaleX, then the number. */
export function BarCell({ value, max, children }: { value: number; max: number; children: ReactNode }) {
  const f = bar(value, max)
  return (
    <span className="share-bar">
      <span className="barwrap" aria-hidden="true">
        <i data-bar="" style={{ transform: `scaleX(${Number(f.toFixed(4))})` }} />
      </span>
      <span>{children}</span>
    </span>
  )
}
export const maxOf = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((m, r) => Math.max(m, f(r) || 0), 0)

export function Lede({ children }: { children: ReactNode }) {
  return <p className="lede">{children}</p>
}
export function Method({ children }: { children: ReactNode }) {
  return <p className="method">{children}</p>
}

/** A stale id in the URL: a calm state with a way back. */
export function StaleState({ title, body, back, backLabel }: { title: string; body?: string; back: Patch; backLabel: string }) {
  return (
    <EmptyState
      title={title}
      body={body ?? 'It may have been deleted, or the link points at another website.'}
      action={
        <RouteLink className="btn btn-sm" patch={back}>
          <ChevronLeft size={14} aria-hidden="true" />
          {backLabel}
        </RouteLink>
      }
    />
  )
}

/** "1 person" / "3 people". */
export const people = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'person' : 'people'}`
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** A 404 from the server: the id in the URL does not exist (any more). */
export const isNotFound = (e: Error | null) => !!e && 'status' in e && (e as { status: number }).status === 404
