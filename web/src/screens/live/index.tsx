// Live (plan Task F3-6): who is on the site now. Polls every 5 s (paused while the tab is hidden, while
// offline, or by the Pause button). Offline: "as of 10:05, not updating", Pause disabled, every dot grey.
import { useMemo, useRef, useState } from 'react'
import { Pause, Play, Zap } from 'lucide-react'
import { api } from '../../api/client'
import type { Live } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import { bar } from '../../lib/bar'
import { fmtInt } from '../../lib/format'
import { rel } from '../../lib/journey'
import { navigate } from '../../state/useUrlState'
import { useOnline } from '../../shell/useOnline'
import { Avatar } from '../../ui/avatar'
import { Button } from '../../ui/button'
import { StatusDot } from '../../ui/small'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { Segmented } from '../../ui/tabs'
import { CountryCode, hm, sourceText, useAq } from '../activity/shared'
import './live.css'

export const POLL_MS = 5000
const STREAM_CAP = 50
type Side = 'country' | 'source' | 'page'
const SIDE_LABEL: Record<Side, string> = { country: 'Countries', source: 'Sources', page: 'Pages' }

export function streamCopy(shown: number, total: number): string {
  return total > STREAM_CAP || shown >= STREAM_CAP ? `The latest ${STREAM_CAP}` : `All ${fmtInt(total)} ${total === 1 ? 'event' : 'events'}`
}

export default function LiveScreen() {
  const { s, q, key, tz } = useAq()
  const online = useOnline()
  const [paused, setPaused] = useState(false)
  const [side, setSide] = useState<Side>('country')
  const [kind, setKind] = useState<'all' | 'pageview' | 'event'>('all')
  const [query, setQuery] = useState('')
  const live = useQuery<Live>(`live|${key}`, async (sig) => api.live(q, sig), { pollMs: paused ? undefined : POLL_MS, staleMs: 0 })
  const seen = useRef<Set<string>>(new Set())
  const d = live.data
  const off = !online
  const frozen = off || paused

  const shown = useMemo(() => {
    const t = query.trim().toLowerCase()
    return (d?.stream ?? []).filter((e) => {
      if (kind === 'pageview' && e.type !== 'pageview') return false
      if (kind === 'event' && e.type === 'pageview') return false
      if (!t) return true
      return `${e.path} ${e.name} ${e.label} ${e.city} ${e.source}`.toLowerCase().includes(t)
    })
  }, [d, kind, query])

  if (!s.site || s.site === 'all') {
    return <EmptyState title="Pick a website" body="Live follows one website at a time. Choose one in the site switcher." />
  }
  if (live.error && !d) return <ErrorState onRetry={live.refetch} />
  if (!d) {
    return (
      <div aria-busy="true">
        <Skeleton height={220} />
        <div style={{ height: 16 }} />
        <Skeleton height={320} />
      </div>
    )
  }

  const list = side === 'country' ? d.countries : side === 'source' ? d.sources : d.pages
  const max = list.reduce((m, x) => Math.max(m, x.count), 0)
  const asOf = hm(d.asOf, tz)
  const fresh = new Set(seen.current)
  const newKeys = new Set<string>()
  for (const e of d.stream) {
    const k = `${e.ts}|${e.sessionId}|${e.path}|${e.name}`
    if (seen.current.size && !fresh.has(k)) newKeys.add(k)
    seen.current.add(k)
  }

  return (
    <div className={`live${frozen ? ' live-off' : ''}`}>
      <div className="live-top">
        <section className="live-hero" aria-label="Visitors now">
          <span className="k">
            <StatusDot tone={off ? 'off' : 'live'} />
            Visitors now
          </span>
          <span className="v" data-testid="live-active">
            {fmtInt(d.active)}
          </span>
          <span className="upd" data-testid="live-updated">
            in the last 5 minutes · {off ? `as of ${asOf}, not updating` : paused ? `paused, as of ${asOf}` : 'updated just now'}
          </span>
          <div className="plane" aria-hidden="true" />
          <div className="live-stats">
            <div>
              <span className="sk2">Events, last 5 min</span>
              <span className="sv">{fmtInt(d.events5m)}</span>
            </div>
            <div>
              <span className="sk2">Countries now</span>
              <span className="sv">{fmtInt(d.countries.length)}</span>
            </div>
            <div>
              <span className="sk2">Pages open now</span>
              <span className="sv">{fmtInt(d.pages.length)}</span>
            </div>
          </div>
        </section>

        <section className="panel live-side" aria-label={SIDE_LABEL[side]}>
          <div className="panel-h">
            <h2 className="sr-only">Active visitors by {side}</h2>
            <Segmented
              ariaLabel="Group active visitors by"
              value={side}
              onValueChange={(v) => setSide(v as Side)}
              items={[
                { value: 'country', label: 'Country' },
                { value: 'source', label: 'Source' },
                { value: 'page', label: 'Page' },
              ]}
            />
            <span className="spacer" />
            <span className="muted" style={{ fontSize: 'var(--text-caption)', paddingRight: 8 }}>
              Active now
            </span>
          </div>
          {list.length ? (
            <ul className="live-rows">
              {list.map((x) => (
                <li key={x.key}>
                  <span className="lab">
                    {side === 'country' && <CountryCode code={x.key} />}
                    <span className={`name${side === 'page' ? ' mono' : ''}`}>{side === 'source' ? sourceText(x.key).replace(/^Came from /, '') : x.key || 'Unknown'}</span>
                  </span>
                  <span className="track" aria-hidden="true">
                    <i data-bar="" style={{ transform: `scaleX(${bar(x.count, max)})` }} />
                  </span>
                  <span className="c">
                    {fmtInt(x.count)}
                    <span className="sr-only"> active</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No one on the site right now" body="The next visit shows up here within 5 seconds." />
          )}
          <p className="panel-def">Each visitor appears once, in their latest country and source. Bots and AI crawlers are never counted here.</p>
        </section>
      </div>

      <div className="sec-h">
        <h2 style={{ margin: 0, fontSize: 'var(--text-body-strong)' }}>Live events</h2>
        <p data-testid="live-stream-copy">
          {streamCopy(d.stream.length, d.streamTotal)} from the last 5 minutes, newest first. Select one to open the visitor’s journey.
        </p>
      </div>
      <section className="live-feed" aria-label="Live events">
        <div className="tool">
          <span className="count">
            <StatusDot tone={frozen ? 'off' : 'live'} />
            <span>
              <b>{fmtInt(shown.length)}</b> events · {off ? `paused while offline, as of ${asOf}` : paused ? 'paused' : 'refreshes every 5 seconds'}
            </span>
          </span>
          <span className="spacer" />
          <label>
            <span className="sr-only">Search events</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pages, events, visitors…" autoComplete="off" />
          </label>
          <Segmented
            ariaLabel="Event type"
            value={kind}
            onValueChange={(v) => setKind(v as typeof kind)}
            items={[
              { value: 'all', label: 'All' },
              { value: 'pageview', label: 'Page views' },
              { value: 'event', label: 'Events' },
            ]}
          />
          <Button size="sm" aria-pressed={paused} disabled={off} onClick={() => setPaused(!paused)}>
            {paused ? <Play aria-hidden="true" size={14} /> : <Pause aria-hidden="true" size={14} />}
            {paused ? 'Resume' : 'Pause updates'}
          </Button>
        </div>
        {shown.length ? (
          <ul className="feed">
            {shown.map((e, i) => {
              const k = `${e.ts}|${e.sessionId}|${e.path}|${e.name}`
              const isPv = e.type === 'pageview'
              return (
                <li key={`${k}|${i}`}>
                  <button
                    type="button"
                    className={`ev-row${newKeys.has(k) ? ' new' : ''}`}
                    onClick={() => navigate({ sheet: { kind: 'journey', person: e.person, session: e.sessionId } })}
                  >
                    <Avatar seed={e.person} size={28} />
                    <span className="who2">
                      <b data-testid="journey-label">{e.label}</b>{' '}
                      <span>{[e.city, e.country].filter(Boolean).join(', ')}</span>
                    </span>{' '}
                    <span className="what">
                      {isPv ? (
                        <>
                          <b className="mono">{e.path}</b>{' '}
                          <span>Page view</span>
                        </>
                      ) : (
                        <>
                          <b>
                            <Zap aria-hidden="true" size={12} /> {e.name}
                          </b>{' '}
                          <span>{e.path ? `on ${e.path}` : 'Custom event'}</span>
                        </>
                      )}
                    </span>{' '}
                    <span className="ctx">{sourceText(e.source)}</span>{' '}
                    <span className="when">{rel(e.ts, d.asOf)}</span>
                    <span className="sr-only">. Open the journey</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            title={d.stream.length ? 'No events match' : 'Nothing in the last 5 minutes'}
            body={d.stream.length ? 'Clear the search, or wait: the next visit shows up within 5 seconds.' : 'Live shows the last 5 minutes. The next visit shows up within 5 seconds.'}
          />
        )}
      </section>
    </div>
  )
}
