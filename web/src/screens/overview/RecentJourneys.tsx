// Recent journeys (Task F2-4): the 5 latest sessions as mini timelines (source → pages → goal).
// Each opens the person's whole journey (v= in the URL). Beside the chart at ≥ 1200px, under it below.
import { ArrowRight } from 'lucide-react'
import { api } from '../../api/client'
import type { Goal, SessionRow } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import { fmtInt } from '../../lib/format'
import { valueLabel } from '../../shell/labels'
import { linkTo, navigate, useUrlState } from '../../state/useUrlState'
import { Avatar } from '../../ui/avatar'
import { Skeleton } from '../../ui/states'
import { useApiQuery } from './useOverviewData'

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

/** The steps of a mini timeline: entry, "+N" for the pages between, exit. */
export function steps(r: Pick<SessionRow, 'entry' | 'exit' | 'pages'>): string[] {
  if (!r.entry) return []
  if (r.pages <= 1 || r.exit === r.entry) return [r.entry]
  const between = Math.max(0, r.pages - 2)
  return between ? [r.entry, `+${between}`, r.exit] : [r.entry, r.exit]
}

export function RecentJourneys({ totalVisitors }: { totalVisitors: number }) {
  const s = useUrlState()
  const { q, key } = useApiQuery()
  const r = useQuery(`sessions5|${key}`, async (sig) => api.sessions(q, { limit: 5 }, sig), { enabled: !!s.site && s.site !== 'all' })
  const goals = useQuery<Goal[]>(`goals|${s.site}|${s.prefix}`, async (sig) => api.goals(s.site, sig), { enabled: !!s.site && s.site !== 'all' && !s.prefix.startsWith('/share/'), staleMs: 60_000 })
  const goalName = (id: number) => goals.data?.find((g) => g.id === id)?.name ?? 'Goal'
  const rows = r.data?.rows ?? []
  return (
    <section className="journeys" aria-labelledby="jr-h">
      <div className="jr-h">
        <h2 id="jr-h">
          Recent journeys{s.filters.length ? <span className="muted"> matching filters</span> : null}
        </h2>
        <a
          className="textbtn"
          href={linkTo({ screen: 'activity', tab: '', id: null, sheet: null })}
          onClick={(e) => {
            e.preventDefault()
            navigate({ screen: 'activity', tab: '', id: null, sheet: null })
          }}
        >
          All {fmtInt(totalVisitors)}
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
      {r.loading && !r.data ? (
        <div aria-busy="true">
          <Skeleton height={200} />
        </div>
      ) : rows.length === 0 ? (
        <p className="muted jr-empty">No visits in this range yet.</p>
      ) : (
        <ol className="jr-list">
          {rows.map((row) => {
            const src = valueLabel('source', row.source)
            const st = steps(row)
            const g = row.goals[0]
            return (
              <li key={row.sessionId}>
                <button
                  type="button"
                  className="jr"
                  aria-label={`Open the journey of ${row.label}: came from ${src}, ${row.pages} ${row.pages === 1 ? 'page' : 'pages'}${g != null ? `, reached ${goalName(g)}` : ''}, ${ago(row.start)}`}
                  onClick={() => navigate({ sheet: { kind: 'journey', person: row.person, session: row.sessionId } })}
                >
                  <Avatar seed={row.person} size={28} />
                  <span className="jr-t">
                    <span className="jr-n">
                      <b data-testid="journey-label">{row.label}</b>
                      <span className="subtle">{ago(row.start)}</span>
                    </span>
                    <span className="trail" aria-hidden="true">
                      <span className="stp src">{src}</span>
                      {st.map((p, i) => (
                        <span key={i} className="trail-s">
                          <span className="ft">
                            <i />
                            <i />
                          </span>
                          {p.startsWith('+') ? <span className="subtle">{p}</span> : <span className="stp mono">{p}</span>}
                        </span>
                      ))}
                      {g != null && (
                        <span className="trail-s">
                          <span className="ft">
                            <i />
                            <i />
                          </span>
                          <span className="stp g">{goalName(g)}</span>
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
