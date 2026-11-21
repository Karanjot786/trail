// Funnel detail (Task F4-3). ONE meaning of a drop-off: "left after step N" = reached step N, never step N+1,
// within the window. The count sits under step N, the summary tile uses the same number and words, and
// "See all" opens every one of those people in the drop-off sheet (?fd=funnel:N).
import { ArrowDownRight, Users } from 'lucide-react'
import { api } from '../../api/client'
import type { FunnelReport } from '../../api/types'
import { bar } from '../../lib/bar'
import { fmtDur, fmtInt, fmtPct } from '../../lib/format'
import { formatRate } from '../../lib/goals'
import { navigate } from '../../state/useUrlState'
import { Button } from '../../ui/button'
import { ErrorState, Skeleton } from '../../ui/states'
import { windowLabel } from './FunnelDialog'
import { Stat, StatStrip, StaleState, isNotFound, maxOf, people, useReport } from './kit'

export const openDropoff = (funnel: number, step: number) => navigate({ sheet: { kind: 'dropoff', funnel, step } })

/** "289 people reached Any /docs page, never /pricing": the words the step and the summary share. */
export function leftText(r: FunnelReport, n: number): string {
  const st = r.steps[n - 1]
  return `${people(st.leftAfter)} reached ${st.label}, never ${r.steps[n]?.label ?? 'the next step'}`
}

export function FunnelDetail({ id }: { id: number }) {
  const r = useReport(`funnel:${id}`, (q, sig) => api.funnelReport(q, id, sig))
  if (isNotFound(r.error))
    return <StaleState title="This funnel no longer exists" back={{ screen: 'conversions', tab: 'funnels', id: null, sheet: null }} backLabel="Back to all funnels" />
  if (r.error && !r.data) return <ErrorState onRetry={r.refetch} />
  if (!r.data) return <Skeleton height={320} />
  const rep = r.data
  const steps = rep.steps
  const n = steps.length
  const max = maxOf(steps, (s) => s.reached)
  const completed = steps[n - 1]?.reached ?? 0
  const drop = rep.biggestDrop
  return (
    <>
      <p className="muted m-0 text-small">
        {n} steps · within {windowLabel(rep.funnel.windowMs)} · {rep.window.label}
      </p>
      <StatStrip>
        <Stat k="Entered" v={fmtInt(rep.started)} s="reached step 1" />
        <Stat k="Completed" v={fmtInt(completed)} s={`reached step ${n}`} />
        <Stat k="Conversion" v={rep.started ? formatRate(completed / rep.started) : 'n/a'} s="end to end" />
        {drop && drop.people > 0 ? (
          <button type="button" data-testid="biggest-drop" onClick={() => openDropoff(rep.funnel.id, drop.after)}>
            <span className="k">Biggest drop-off</span>
            <span className="v word">left after step {drop.after}</span>
            <span className="s" data-left={drop.people}>
              {leftText(rep, drop.after)} · see who
            </span>
          </button>
        ) : (
          <Stat k="Biggest drop-off" v="none" s={rep.started ? 'everyone who started finished' : 'nobody started yet'} />
        )}
      </StatStrip>
      <section className="panel f4-panel" aria-label={`${rep.funnel.name} steps`}>
        <ol className="funnel">
          {steps.map((st, i) => {
            const f = bar(st.reached, max)
            const def = rep.funnel.steps[i]
            return (
              <li key={i}>
                <div className="fstep" data-step={i + 1}>
                  <div className="lab">
                    <b>
                      {i + 1}. {st.label}
                    </b>
                    <span>
                      {def?.kind === 'event' ? 'Event' : 'Page view'}
                      {i > 0 && st.medianMsFromPrev != null && ` · median ${fmtDur(st.medianMsFromPrev)} after step ${i}`}
                    </span>
                  </div>
                  <div className="fbars" aria-hidden="true">
                    <i data-funnel-bar="" style={{ transform: `scaleX(${Number(f.toFixed(4))})` }} />
                    <em>{formatRate(st.fromStart)}</em>
                  </div>
                  <div className="nums">
                    <b>{fmtInt(st.reached)}</b> {st.reached === 1 ? 'person' : 'people'}
                    <span>{i ? `${fmtPct(st.fromPrev)} of step ${i}` : 'started the funnel'}</span>
                  </div>
                </div>
                {i < n - 1 && (
                  <div className="fdrop" data-left-step={i + 1} data-left={st.leftAfter}>
                    <ArrowDownRight size={14} aria-hidden="true" />
                    <span>
                      <b>{fmtInt(st.leftAfter)}</b> left after step {i + 1} ({st.reached ? fmtPct(st.leftAfter / st.reached) : '0%'}): reached {st.label}, never {steps[i + 1].label}
                    </span>
                    {st.leftAfter > 0 && (
                      <Button size="sm" onClick={() => openDropoff(rep.funnel.id, i + 1)}>
                        <Users size={14} aria-hidden="true" />
                        See all {fmtInt(st.leftAfter)}
                        <span className="sr-only"> people who left after step {i + 1}</span>
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        <p className="panel-def" style={{ paddingBottom: 14 }}>
          Steps must happen in order, by the same person, within {windowLabel(rep.funnel.windowMs)} of step 1. Other pages in between are allowed. “Left after step N” always
          means: reached step N, never reached step N+1.
        </p>
      </section>
    </>
  )
}
