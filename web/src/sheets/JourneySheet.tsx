// The journey sheet (plan Task F3-2): one person's visits. A pinned header (who, from where, totals, the goal
// badge, the visits strip), then the timeline. `[` / `]` (the shell's `trail:visit` event) and strip clicks
// scroll to and focus a visit; `v=person~session` opens at that session.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, ArrowUpRight, Flag, LogOut, UserCheck, Zap } from 'lucide-react'
import { api } from '../api/client'
import type { JourneySession, SessionRow, Step } from '../api/types'
import { useQuery } from '../api/useQuery'
import { fmtDur, fmtInt, fmtShortDay } from '../lib/format'
import { foldSteps, gapText, goalBadge, goalMatches, hitsAt, sessionEnd, spanDays, stripLayout, visitNo, visitsPhrase } from '../lib/journey'
import { CountryCode, dayTime, hm, sourceText, useAq } from '../screens/activity/shared'
import { navigate } from '../state/useUrlState'
import { useStats } from '../shell/useStats'
import { Button } from '../ui/button'
import { Avatar } from '../ui/avatar'
import { Sheet } from '../ui/dialog'
import { Badge, Chip, Kbd } from '../ui/small'
import { AgentBadge, agentName, agentProvider } from '../screens/crawlers/AgentBadge'
import { EmptyState, ErrorState, Skeleton } from '../ui/states'
import '../screens/activity/activity.css'

export function JourneySheet() {
  const { s, q, key, share } = useAq()
  const sheet = s.sheet?.kind === 'journey' ? s.sheet : null
  // The list row carries the person's label (a pseudonym on share links) and browser details.
  const meta = useQuery(`journey-meta|${key}|${sheet?.person ?? ''}`, async (sig) => api.sessions(q, { person: sheet!.person, limit: 1 }, sig), { enabled: !!sheet, keepPrevious: false })
  const row = meta.data?.rows[0]
  const label = sheet ? row?.label || (share ? 'Visitor' : shortId(sheet.person)) : 'Journey'
  return (
    <Sheet open={!!sheet} onOpenChange={(o) => !o && navigate({ sheet: null })} title="Journey" size="wide">
      {sheet && <Journey person={sheet.person} session={sheet.session} row={row} label={label} />}
    </Sheet>
  )
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
}

export function Journey({ person, session, row, label }: { person: string; session?: string; row?: SessionRow; label: string }) {
  const { q, key, tz, share } = useAq()
  const j = useQuery<JourneySession[]>(`journey|${key}|${person}`, async (sig) => api.journey(q, person, sig), { keepPrevious: false })
  const sessions = useMemo(() => [...(j.data ?? [])].sort((a, b) => a.start - b.start), [j.data])
  const body = useRef<HTMLDivElement>(null)
  const [newestFirst, setNewestFirst] = useState(false)
  // The journey lists every visit; the ones outside the selected range are greyed and labelled, so the
  // visitor row's "N visits in range" and this list never seem to disagree.
  const w = useStats().data?.window
  const inRange = (x: JourneySession) => !w || (x.start <= w.to && sessionEnd(x) >= w.from)

  const heads = () => Array.from(body.current?.querySelectorAll<HTMLElement>('.visit-h') ?? [])
  /** Focus visit i (oldest first, as in the strip), whatever order the timeline shows. */
  const focusVisit = (i: number) => focusHead(heads().find((x) => x.dataset.visit === sessions[i]?.sessionId))
  const focusHead = (h: HTMLElement | undefined) => {
    if (!h) return
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    h.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    h.focus({ preventScroll: true })
  }

  // `[` / `]` from the shell: the previous or next visit relative to the focused (or first visible) one.
  useEffect(() => {
    const onVisit = (e: Event) => {
      const step = Number((e as CustomEvent).detail) < 0 ? -1 : 1
      const hs = heads()
      if (!hs.length) return
      let cur = hs.findIndex((h) => h === document.activeElement)
      if (cur < 0) {
        const top = body.current?.getBoundingClientRect().top ?? 0
        const firstBelow = hs.findIndex((h) => h.getBoundingClientRect().top > top + 2)
        cur = firstBelow < 0 ? hs.length - 1 : firstBelow - 1
      }
      focusHead(hs[Math.max(0, Math.min(hs.length - 1, cur + step))])
    }
    window.addEventListener('trail:visit', onVisit)
    return () => window.removeEventListener('trail:visit', onVisit)
  }, [])

  // Deep link to one session: scroll there once the timeline is in.
  const landed = useRef('')
  useEffect(() => {
    if (!session || !sessions.length || landed.current === session) return
    const i = sessions.findIndex((x) => x.sessionId === session)
    if (i < 0) return
    landed.current = session
    requestAnimationFrame(() => focusVisit(i))
  }, [session, sessions])

  if (j.error && !j.data) return <ErrorState onRetry={j.refetch} />
  if (j.loading && !j.data) {
    return (
      <div aria-busy="true">
        <Skeleton height={120} />
        <div style={{ height: 12 }} />
        <Skeleton height={320} />
      </div>
    )
  }
  if (!sessions.length) {
    return (
      <EmptyState
        title="No journey for this visitor"
        body="This person no longer exists or has no visits in the last 180 days. The link may be from a deleted site or an old export."
      />
    )
  }

  const first = sessions[0]
  const last = sessions[sessions.length - 1]
  const firstPage = first.steps.find((x) => x.type === 'pageview')?.path ?? ''
  const lastPage = [...last.steps].reverse().find((x) => x.type === 'pageview')?.path ?? ''
  const pages = sessions.reduce((a, x) => a + x.steps.filter((st) => st.type === 'pageview').length, 0)
  const time = sessions.reduce((a, x) => a + (x.durationMs || 0), 0)
  const days = spanDays(sessions, tz)
  const matches = goalMatches(sessions)
  const badge = goalBadge(sessions)
  const now = Date.now()
  const outside = sessions.filter((x) => !inRange(x)).length
  const shown = newestFirst ? [...sessions].reverse() : sessions
  const strip = stripLayout(
    sessions.map((x) => x.start),
    now,
    tz,
  )

  return (
    <div ref={body}>
      <div className="jhead">
        <div className="id">
          <Avatar seed={person} size={40} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span className="who-l" data-testid="journey-label">
              {label}
            </span>
            <span className="meta">
              {share ? <Badge>shared view: names and IDs hidden</Badge> : <span className="mono">{shortId(person)}</span>}
            </span>
          </div>
        </div>
        <div className="jfacts">
          <span>{first.source && first.source !== 'Direct' && first.source !== '(direct)' ? <>Came from <b>{first.source}</b></> : <>Came <b>directly</b></>}</span>
          {firstPage && (
            <span>
              Landed on <b className="mono">{firstPage}</b>
            </span>
          )}
          {lastPage && (
            <span>
              Was last on <b className="mono">{lastPage}</b>
            </span>
          )}
          {(last.city || last.country) && (
            <span className="inl">
              <CountryCode code={last.country} /> <b>{last.city || last.country}</b>
              {last.city && <span className="muted"> (rough estimate)</span>}
            </span>
          )}
          {(row?.browser || last.device) && (
            <span>
              {row?.browser ? (
                <>
                  <b>{row.browser}</b>
                  {row.os ? <> on <b>{row.os}</b></> : null}
                  {last.device ? ` (${last.device.toLowerCase()})` : ''}
                </>
              ) : (
                <b>{last.device}</b>
              )}
            </span>
          )}
          <span>
            First seen <b>{dayTime(first.start, tz)}</b>
          </span>
        </div>
        <div className="jstats">
          <div>
            <span className="k">Visits</span>
            <span className="v" data-span-days={days}>
              {fmtInt(sessions.length)}
              <small>{visitsPhrase(sessions.length, days).replace(/^\S+ visits? ?/, '')}</small>
              {outside > 0 && <small data-testid="visits-in-range">{fmtInt(sessions.length - outside)} in range</small>}
            </span>
          </div>
          <div>
            <span className="k">Pages</span>
            <span className="v">{fmtInt(pages)}</span>
          </div>
          <div>
            <span className="k">Time on site</span>
            <span className="v">{fmtDur(time)}</span>
          </div>
          <div>
            <span className="k">{matches.length > 1 ? 'Goals' : 'Goal'}</span>
            <span className="v" data-testid="goal-badge" title={badge || undefined}>
              {badge ? (
                <>
                  <span className="goal-ring" aria-hidden="true" />
                  {matches.length === 1 ? badge : <small style={{ color: 'var(--fg)', fontSize: 'var(--text-small)', fontWeight: 600 }}>{badge}</small>}
                </>
              ) : (
                <small>None yet</small>
              )}
            </span>
          </div>
        </div>
        <div
          className="survey"
          style={{ ['--lanes' as string]: strip.lanes }}
          role="group"
          aria-label={`${sessions.length} ${sessions.length === 1 ? 'visit' : 'visits'} on a timeline from ${fmtShortDay(strip.from, tz)} to ${fmtShortDay(strip.to - 1, tz)}. Choose one to jump to it.`}
        >
          <div className="survey-ticks" aria-hidden="true" />
          {strip.marks.map((m) => {
            const x = sessions[m.index]
            const n = visitNo(x, m.index)
            const pv = x.steps.filter((st) => st.type === 'pageview').length
            const goal = (x.goals ?? []).length > 0
            const out = !inRange(x)
            return (
              <button
                key={x.sessionId}
                type="button"
                className={`vmark${goal ? ' goal' : ''}${out ? ' out' : ''}`}
                data-anchor={m.anchor}
                style={{ left: `${m.left.toFixed(2)}%`, ['--lane' as string]: m.lane }}
                onClick={() => focusVisit(m.index)}
              >
                {/* Named from its content, so the name starts with what is visible ("1 Nov 21"). */}
                <span className="sr-only">Visit </span>
                <span className="vn">{n}</span>{' '}
                <span className="vt">
                  <b>{fmtShortDay(x.start, tz)}</b>
                  <span className="sr-only">{`, ${hm(x.start, tz)}, ${pv} ${pv === 1 ? 'page' : 'pages'}${goal ? ', reached a goal' : ''}${out ? ', outside the selected range' : ''}. Jump to it`}</span>
                  <span className="vd" aria-hidden="true">
                    {Array.from({ length: Math.min(5, pv) }, (_, k) => (
                      <i key={k} />
                    ))}
                  </span>
                </span>
                {goal && <span className="goal-ring" aria-hidden="true" />}
              </button>
            )
          })}
          <div className="ax" aria-hidden="true">
            <span>{fmtShortDay(strip.from, tz)}</span>
            <span>{fmtShortDay((strip.from + strip.to) / 2, tz)}</span>
            <span>{fmtShortDay(strip.to - 1, tz)}</span>
          </div>
        </div>
      </div>

      <div className="jtools">
        <b>Timeline</b>
        <span className="muted">
          {fmtInt(sessions.length)} {sessions.length === 1 ? 'visit' : 'visits'}, {fmtInt(pages)} {pages === 1 ? 'page' : 'pages'}
        </span>
        <span className="spacer" />
        <span className="muted kbds" aria-hidden="true">
          <Kbd>[</Kbd> <Kbd>]</Kbd> visits
        </span>
        <Button size="sm" aria-pressed={newestFirst} onClick={() => setNewestFirst((v) => !v)}>
          <ArrowDownUp size={14} aria-hidden="true" />
          {newestFirst ? 'Newest first' : 'Oldest first'}
        </Button>
      </div>

      {shown.map((x, k) => {
        const i = sessions.indexOf(x)
        const before = k > 0 ? shown[k - 1] : null
        const gap = before == null ? null : newestFirst ? gapText(Math.max(0, before.start - sessionEnd(x)), 'earlier') : gapText(Math.max(0, x.start - sessionEnd(before)))
        return <Visit key={x.sessionId} s={x} i={i} gap={gap} out={!inRange(x)} tz={tz} current={x.sessionId === session} />
      })}
      <p className="jnote">
        Everything this person did in the last 180 days, {tz.split('/').pop()?.replace(/_/g, ' ')} time. Time on a page is the gap until the next step; the last page of a visit counts until the
        tab was hidden. Filters do not hide steps here.
      </p>
    </div>
  )
}

function Visit({ s, i, gap, out, tz, current }: { s: JourneySession; i: number; gap: string | null; out: boolean; tz: string; current: boolean }) {
  const steps = foldSteps(s.steps)
  const firstPv = steps.findIndex((x) => x.type === 'pageview')
  const pv = steps.filter((x) => x.type === 'pageview').length
  const exit = [...steps].reverse().find((x) => x.type === 'pageview')?.path ?? ''
  const n = visitNo(s, i)
  return (
    <>
      {gap && (
        <div className="gap">
          <span className="feet" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {gap}
        </div>
      )}
      <section className={`visit${out ? ' out' : ''}`} aria-labelledby={`visit-${s.sessionId}`}>
        <h3 className="visit-h" id={`visit-${s.sessionId}`} tabIndex={-1} data-visit={s.sessionId} aria-current={current || undefined}>
          <span>Visit {n}</span>
          {s.agent && (
            <span className="inline-flex items-center gap-1.5">
              <Badge tone="blue">AI agent</Badge>
              <span className="w">{agentName(s.agent)}</span>
              <AgentBadge via={s.via || 'ua'} provider={agentProvider(s.agent)} />
            </span>
          )}
          <span className="w">{dayTime(s.start, tz)}</span>
          <span className="src">{sourceText(s.source).replace(/^Came/, 'came')}</span>
          <span className="w">
            · {fmtDur(s.durationMs)} · {pv} {pv === 1 ? 'page' : 'pages'}
          </span>
          {out && <span className="out-l">outside selected range</span>}
        </h3>
        <ol className="steps">
          {steps.map((st, k) => (
            <StepRow key={`${st.ts}-${k}`} s={s} st={st} landed={k === firstPv} tz={tz} />
          ))}
          {exit && (
            <li className="step left">
              <div className="p">
                <LogOut aria-hidden="true" size={12} />
                Left after {fmtDur(s.durationMs)} from <span className="mono">{exit}</span>
              </div>
            </li>
          )}
        </ol>
      </section>
    </>
  )
}

function PropChips({ props, max = 3 }: { props: Step['props']; max?: number }) {
  return (
    <>
      {Object.entries(props ?? {})
        .slice(0, max)
        .map(([k, v]) => (
          <Chip key={k} k={k} v={String(v)} />
        ))}
    </>
  )
}

function StepRow({ s, st, landed, tz }: { s: JourneySession; st: Step; landed: boolean; tz: string }) {
  const hits = hitsAt(s, st)
  if (st.type === 'pageview') {
    return (
      <li className={`step${hits.length ? ' has-goal' : ''}`}>
        <div className="p">
          {landed && <Badge>landed</Badge>}
          <span className="path">{st.path}</span>
          {hits.map((g) => (
            <span key={g.id} className="goal-chip">
              <span className="goal-ring" aria-hidden="true" />
              {g.name} goal
            </span>
          ))}
        </div>
        <span className="t">{fmtDur(st.engagedMs)}</span>
        <div className="sub">
          <span className="scrollbar">
            <span className="barwrap" aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, st.scrollPct / 100)).toFixed(2)})` }} />
            </span>
            scrolled {Math.round(st.scrollPct)}%
          </span>
          <span>{hm(st.ts, tz)}</span>
        </div>
      </li>
    )
  }
  if (st.type === 'event' && hits.length) {
    return (
      <li className="step goal">
        <div className="p">
          <Flag aria-hidden="true" size={14} />
          <b>Reached the {hits[0].name} goal</b>
          <PropChips props={st.props} max={6} />
        </div>
        <span className="t">{hm(st.ts, tz)}</span>
        <div className="sub">Event “{st.name}” · this is the moment the visit counted as a conversion</div>
      </li>
    )
  }
  if (st.type === 'event') {
    return (
      <li className="step ev">
        <div className="p">
          <Zap aria-hidden="true" size={14} />
          <span>{st.name}</span>
          <PropChips props={st.props} />
          {hits.map((g) => (
            <span key={g.id} className="goal-chip">
              {g.name} goal
            </span>
          ))}
        </div>
        <span className="t">{hm(st.ts, tz)}</span>
      </li>
    )
  }
  if (st.type === 'outbound') {
    return (
      <li className="step out">
        <div className="p">
          <ArrowUpRight aria-hidden="true" size={14} />
          <span>
            Clicked out to <span className="mono">{st.name || st.path}</span>
          </span>
        </div>
        <span className="t">{hm(st.ts, tz)}</span>
      </li>
    )
  }
  if (st.type === 'identify') {
    return (
      <li className="step idf">
        <div className="p">
          <UserCheck aria-hidden="true" size={14} />
          <span>
            Identified as <b>{st.name}</b>
          </span>
        </div>
        <span className="t">{hm(st.ts, tz)}</span>
        <div className="sub">Earlier anonymous visits are now joined to this person.</div>
      </li>
    )
  }
  if (hits.length) {
    return (
      <li className="step goal">
        <div className="p">
          <Flag aria-hidden="true" size={14} />
          <b>Reached the {hits[0].name} goal</b>
        </div>
        <span className="t">{hm(st.ts, tz)}</span>
      </li>
    )
  }
  return null
}
