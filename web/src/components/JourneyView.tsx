import { Fragment, type ReactNode } from 'react'
import { ArrowLeftIcon, ArrowUpRightIcon, ChevronRightIcon, FileTextIcon, LogOutIcon, TriangleAlertIcon, UserCheckIcon, ZapIcon } from 'lucide-react'
import { api, type Session, type Step } from '@/api'
import { useDashboard } from '@/state'
import { useFetch } from '@/useFetch'
import { dur, num } from '@/format'
import { foldSteps, groupByDay } from '@/journey'
import { Favicon } from '@/dims'
import { TZ, fmtTime, fmtWeekday } from '@/time'
import { shortPerson } from './VisitorsView'

export function JourneyView({ person }: { person: string }) {
  const d = useDashboard()
  const { data: sessions } = useFetch(`journey|${d.site}|${person}`, (s) => api.journey(d.site, person, s))
  // person resolves to the user_id once any of its anon ids identified, so any identify step means identified
  const identified = !!sessions?.some((s) => s.steps.some((st) => st.type === 'identify'))
  const days = sessions ? groupByDay(sessions, TZ) : []

  return (
    <section className="flex flex-col gap-5" aria-label={`Journey of ${person}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          onClick={() => d.set({ person: '' }, { push: true })}
          className="pressable flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-fg outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeftIcon className="size-4" strokeWidth={1.5} /> Visitors
        </button>
        <h1 className="flex min-w-0 items-center gap-2 text-xl font-semibold tracking-[-0.02em]">
          <span className={identified ? 'truncate' : 'truncate font-mono text-lg'}>{shortPerson(person, identified)}</span>
          {identified && <span className="rounded-md bg-good-bg px-1.5 py-0.5 text-xs font-medium text-good">identified</span>}
        </h1>
        {sessions && (
          <p className="num text-sm text-muted">
            {num(sessions.length)} {sessions.length === 1 ? 'visit' : 'visits'} over {num(days.length)} {days.length === 1 ? 'day' : 'days'}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-black">
        {sessions?.length === 0 && <p className="p-10 text-center text-sm text-muted">No activity recorded for this person.</p>}
        {days.map((g, i) => (
          <div key={g.day} className={i ? 'flex flex-col border-t border-border md:flex-row' : 'flex flex-col md:flex-row'}>
            <div className="flex shrink-0 items-baseline gap-2 px-4 pb-1 pt-4 md:w-36 md:flex-col md:gap-0.5 md:border-r md:border-border md:py-5 md:pl-6">
              <span className="text-[15px] font-medium text-fg">{g.label}</span>
              <span className="text-sm text-muted">{fmtWeekday(g.sessions[0].start)}</span>
            </div>
            <ol className="flex min-w-0 flex-1 flex-col">
              {g.sessions.map((s, j) => (
                <SessionLine key={s.sessionId} session={s} first={j === 0} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}

function SessionLine({ session, first }: { session: Session; first: boolean }) {
  const steps = foldSteps(session.steps)
  const time = steps.reduce((t, s) => t + (s.type === 'pageview' ? s.engagedMs : 0), 0)
  return (
    <li className={first ? 'flex gap-3 px-4 py-3 md:py-5' : 'flex gap-3 border-t border-border/60 px-4 py-3 md:py-5'}>
      <span className="num w-12 shrink-0 pt-1 text-sm text-muted" title={`${dur(time)} engaged`}>
        {fmtTime(session.start)}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-2">
        <Chip>
          {session.source ? <Favicon host={session.source} /> : null}
          <span className={session.source ? 'text-fg' : 'text-muted'}>{session.source || 'Direct'}</span>
        </Chip>
        {steps.map((st, i) => (
          <Fragment key={`${st.ts}-${i}`}>
            {st.type === 'pageview' ? <Arrow /> : null}
            <StepView step={st} />
          </Fragment>
        ))}
        <Arrow />
        <span className="flex items-center gap-1 text-sm text-subtle">
          <LogOutIcon className="size-3.5" strokeWidth={1.5} aria-hidden /> left
        </span>
      </div>
    </li>
  )
}

const Arrow = () => <ChevronRightIcon className="size-3.5 shrink-0 text-subtle" strokeWidth={1.5} aria-hidden />

function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-sm ${className}`}>
      {children}
    </span>
  )
}

function StepView({ step: st }: { step: Step }) {
  switch (st.type) {
    case 'pageview':
      return (
        <Chip>
          <span className="truncate text-fg" title={st.path}>
            {st.path}
          </span>
          {st.engagedMs > 0 && <span className="num shrink-0 rounded bg-raised px-1 text-xs text-muted">{dur(st.engagedMs)}</span>}
          {st.scrollPct > 0 && (
            <span className="num shrink-0 text-xs text-subtle" title="Max scroll depth">
              ↓{st.scrollPct}%
            </span>
          )}
        </Chip>
      )
    case 'event':
      return (
        <span className="flex h-7 items-center gap-1 rounded-md bg-[#0d1f3a] px-2 text-sm font-medium text-[#6cb2ff]" title={propsText(st)}>
          <ZapIcon className="size-3.5" strokeWidth={2} aria-hidden /> {st.name}
        </span>
      )
    case 'identify':
      return (
        <span className="flex h-7 items-center gap-1 rounded-md bg-good-bg px-2 text-sm text-good">
          <UserCheckIcon className="size-3.5" strokeWidth={2} aria-hidden /> identified <span className="font-medium">{st.name}</span>
        </span>
      )
    case 'error':
      return (
        <span
          className="flex h-7 min-w-0 max-w-64 items-center gap-1 rounded-md bg-bad-bg px-2 text-sm text-bad"
          title={st.props.message ?? st.name}
        >
          <TriangleAlertIcon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span className="truncate">{st.props.message ?? 'Error'}</span>
        </span>
      )
    case 'outbound': {
      const url = st.props.url ?? ''
      let host = url
      try {
        host = new URL(url).host.replace(/^www\./, '')
      } catch {
        /* keep raw */
      }
      return (
        <span className="flex h-7 min-w-0 items-center gap-1 rounded-md border border-dashed border-border-strong px-2 text-sm text-muted" title={url}>
          <ArrowUpRightIcon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span className="truncate">{host || 'outbound'}</span>
        </span>
      )
    }
    case 'form':
      return (
        <span className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-sm text-muted">
          <FileTextIcon className="size-3.5" strokeWidth={1.75} aria-hidden /> submitted <span className="text-fg">{st.name || 'form'}</span>
        </span>
      )
    default:
      return null
  }
}

function propsText(st: Step) {
  const e = Object.entries(st.props)
  return e.length ? e.map(([k, v]) => `${k}: ${v}`).join('\n') : st.name
}
