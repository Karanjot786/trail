// AI visibility → Funnel (plan F-2): crawled → fetched for an answer → cited → visited → converted. Each step
// keeps its own unit (requests, sessions, people), so steps are linked by ratios, never by a % conversion.
// "Cited" has no public source and shows no number.
import type { ReactNode } from 'react'
import type { AIFunnelStep, AIPageRow, AIProviderRow, AISetup, AIStepKey, AIVisibility } from '../../api/types'
import { api } from '../../api/client'
import { fmtInt, fmtPct } from '../../lib/format'
import { inWindow } from '../../lib/phrases'
import { RouteLink } from '../../shell/RouteLink'
import { DeltaPill } from '../../ui/delta-pill'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { InfoHint } from '../../ui/tooltip'
import LazyTable from '../activity/LazyTable'
import { BarCell, Lede, Method, maxOf, useReport } from '../conversions/kit'
import { SetupStatus, UnlockCard } from './UnlockCard'
import { ago, monogram, perVisit } from './util'

const SINGLE_DAY = /^(today|yesterday|d:)/

export const STEP_LABEL: Record<AIStepKey, string> = {
  crawled: 'Crawled',
  fetched: 'Fetched for an answer',
  cited: 'Cited',
  visited: 'Visited',
  converted: 'Converted',
}
const UNIT: Record<AIFunnelStep['unit'], string> = { requests: 'requests', sessions: 'sessions', people: 'people, first touch' }
const SOURCE: Record<AIStepKey, string> = {
  crawled: 'server hook or logs',
  fetched: 'server hook or logs',
  cited: 'not published by any AI provider',
  visited: 'your script',
  converted: 'your script',
}
const DEF: Record<AIStepKey, string> = {
  crawled: 'Requests from AI crawlers that index pages or collect them for training.',
  fetched: 'Requests from assistants that fetched a page live because a person asked them something.',
  cited: 'No AI provider publishes which answers cite your pages. Bing Webmaster Tools shows Copilot citations; import is planned.',
  visited: 'Visits that arrived from an AI assistant (ChatGPT, Perplexity, Claude, Gemini, Copilot and others).',
  converted: 'People whose first visit came from an AI assistant and who later reached the goal.',
}

const n = (s: AIFunnelStep | undefined): number | null => (s && s.status === 'ok' ? s.value : null)

export function FunnelTab({ domain, setup }: { domain: string; setup: AISetup | undefined }) {
  const r = useReport('ai-visibility', (q, sig) => api.aiVisibility(q, sig))
  const s = r.s
  if (r.error && !r.data) return <ErrorState onRetry={r.refetch} />
  if (!r.data)
    return (
      <div className="f4" aria-busy="true">
        <Skeleton height={96} />
        <Skeleton height={160} />
      </div>
    )
  const d = r.data
  const w = d.window
  const cmpOn = s.cmp !== 'none' && !w.basis.none
  const widened = SINGLE_DAY.test(s.range)
  const showCard = setup?.crawls.state === 'none'

  return (
    <div className="f4">
      <Lede>
        How AI systems reach {domain} {inWindow(w)}: crawlers read your pages, assistants fetch them to answer someone, and some of those people click through.
        Each step keeps its own unit.
        {widened && ' Showing the last 7 days: crawler data is daily.'}
      </Lede>
      {showCard ? <UnlockCard site={s.site} domain={domain} setup={setup} /> : setup && <ServerHookLine setup={setup} />}
      <FunnelSteps d={d} cmpOn={cmpOn} />
      <ProvidersTable rows={d.providers} />
      <PagesTable rows={d.pages} window={w} />
      <Method>
        Crawled counts requests from training, indexing and general AI crawlers; fetched for an answer counts live fetches by assistants (both from the server
        hook or your logs). Cited has no public source yet. Visited counts sessions referred by an AI assistant, and converted counts people whose first touch
        was an assistant and who reached {d.conv ? `“${d.conv.name}”` : 'the goal'}; both come from your script and match Acquisition → AI referrals.
        {widened ? ' A single day is widened to the last 7 days for every step.' : ''}
        {d.verifiedShare != null ? ` ${fmtPct(d.verifiedShare)} of requests among crawlers that publish IPs came from their listed addresses.` : ''}
      </Method>
    </div>
  )
}

function ServerHookLine({ setup }: { setup: AISetup }) {
  return (
    <div className="ai-hookline">
      <span className="muted">Server hook:</span>
      <SetupStatus setup={setup} />
    </div>
  )
}

export function FunnelSteps({ d, cmpOn }: { d: AIVisibility; cmpOn: boolean }) {
  const by = new Map(d.steps.map((x) => [x.key, x]))
  const order: AIStepKey[] = ['crawled', 'fetched', 'cited', 'visited', 'converted']
  const ratio = perVisit(n(by.get('fetched')), n(by.get('visited')))
  return (
    <section className="ai-funnel" aria-labelledby="ai-funnel-h">
      <h2 id="ai-funnel-h" className="ai-h2">
        AI visibility funnel
      </h2>
      <div className="aif-box">
        <ol className="aif">
          {order.map((k, i) => (
            <StepCard key={k} k={k} st={by.get(k)} i={i} cmpOn={cmpOn} basis={d.window.basis} />
          ))}
        </ol>
        <p className="aif-ratio">
          <span className="br" aria-hidden="true" />
          <span className="t">
            <span className="sr-only">From fetched to visited: </span>
            {ratio}
          </span>
          <span className="br" aria-hidden="true" />
        </p>
      </div>
    </section>
  )
}

function StepCard({ k, st, i, cmpOn, basis }: { k: AIStepKey; st: AIFunnelStep | undefined; i: number; cmpOn: boolean; basis: AIVisibility['window']['basis'] }) {
  const status = st?.status ?? 'not_set_up'
  const unit = st ? UNIT[st.unit] : ''
  let value: ReactNode
  if (status === 'no_source') value = <span className="word">No public source</span>
  else if (status === 'not_set_up') value = <span className="word">Not set up</span>
  else if (status === 'no_goal')
    value = (
      <RouteLink className="word" patch={{ screen: 'conversions', tab: 'goals', id: null, sheet: null }}>
        Set up a goal
      </RouteLink>
    )
  else value = fmtInt(st?.value ?? 0)
  const delta = status === 'ok' && cmpOn && st?.prev != null
  return (
    <li className="aif-step" data-step={k} data-status={status}>
      <span className="k">
        <span className="no" aria-hidden="true">
          {i + 1}
        </span>
        {STEP_LABEL[k]}
        <InfoHint label={STEP_LABEL[k]}>{DEF[k]}</InfoHint>
      </span>
      <span className="v">{value}</span>
      <span className="s">
        {status === 'no_source' ? 'citations' : unit}
        {delta && <DeltaPill cur={st!.value} prev={st!.prev} kind="count" goodWhen="up" basis={basis} />}
      </span>
      <span className="src">{SOURCE[k]}</span>
    </li>
  )
}

function ProvidersTable({ rows }: { rows: AIProviderRow[] }) {
  const mc = maxOf(rows, (r) => r.crawled)
  const mf = maxOf(rows, (r) => r.fetched)
  const mv = maxOf(rows, (r) => r.visited)
  return (
    <LazyTable<AIProviderRow>
      noun="providers"
      nounOne="provider"
      caption="AI providers"
      data={rows}
      initialSort={{ id: 'fetched', desc: true }}
      getSearchText={(x) => x.provider}
      emptyState={<EmptyState title="No AI providers yet" body="Crawler requests and AI referrals appear here by provider." />}
      columns={[
        {
          id: 'provider',
          header: 'Provider',
          enableHiding: false,
          accessorFn: (x) => x.provider,
          cell: (x) => (
            <span className="prov">
              <span className="pm" aria-hidden="true">
                {monogram(x.provider)}
              </span>
              {x.provider}
            </span>
          ),
        },
        { id: 'crawled', header: 'Crawled', sortDescFirst: true, accessorFn: (x) => x.crawled, meta: { align: 'r', hideSm: true }, cell: (x) => <BarCell value={x.crawled} max={mc}>{fmtInt(x.crawled)}</BarCell> },
        { id: 'fetched', header: 'Fetched', sortDescFirst: true, accessorFn: (x) => x.fetched, meta: { align: 'r' }, cell: (x) => <BarCell value={x.fetched} max={mf}>{fmtInt(x.fetched)}</BarCell> },
        { id: 'visited', header: 'Visits', sortDescFirst: true, accessorFn: (x) => x.visited, meta: { align: 'r' }, cell: (x) => <BarCell value={x.visited} max={mv}>{fmtInt(x.visited)}</BarCell> },
        { id: 'converted', header: 'Converted', sortDescFirst: true, accessorFn: (x) => x.converted ?? -1, meta: { align: 'r', hideSm: true }, cell: (x) => (x.converted == null ? <span className="muted">–</span> : fmtInt(x.converted)) },
        {
          id: 'ratio',
          header: 'Fetches per visit',
          sortDescFirst: true,
          accessorFn: (x) => (x.visited ? x.fetched / x.visited : -1),
          meta: { align: 'r', hideSm: true, definition: 'Answer fetches by this provider’s assistants for each visit it referred. Different units, so not a rate.' },
          cell: (x) => (x.visited ? fmtInt(Math.round(x.fetched / x.visited)) : <span className="muted">no visits</span>),
        },
      ]}
    />
  )
}

function PagesTable({ rows, window: w }: { rows: AIPageRow[]; window: AIVisibility['window'] }) {
  const mc = maxOf(rows, (r) => r.crawled)
  const mf = maxOf(rows, (r) => r.fetched)
  const mv = maxOf(rows, (r) => r.visits)
  return (
    <LazyTable<AIPageRow>
      noun="pages"
      nounOne="page"
      caption="Pages AI systems requested"
      data={rows}
      initialSort={{ id: 'fetched', desc: true }}
      getSearchText={(x) => x.path}
      emptyState={<EmptyState title={`No pages requested by AI systems ${inWindow(w)}`} body="Pages that AI crawlers request, or that assistants send people to, appear here." />}
      columns={[
        { id: 'path', header: 'Page', enableHiding: false, accessorFn: (x) => x.path, cell: (x) => <b className="mono font-medium">{x.path}</b> },
        { id: 'crawled', header: 'Crawled', sortDescFirst: true, accessorFn: (x) => x.crawled, meta: { align: 'r', hideSm: true }, cell: (x) => <BarCell value={x.crawled} max={mc}>{fmtInt(x.crawled)}</BarCell> },
        { id: 'fetched', header: 'Fetched', sortDescFirst: true, accessorFn: (x) => x.fetched, meta: { align: 'r' }, cell: (x) => <BarCell value={x.fetched} max={mf}>{fmtInt(x.fetched)}</BarCell> },
        { id: 'visits', header: 'Visits', sortDescFirst: true, accessorFn: (x) => x.visits, meta: { align: 'r' }, cell: (x) => <BarCell value={x.visits} max={mv}>{fmtInt(x.visits)}</BarCell> },
        { id: 'conv', header: 'Conversions', sortDescFirst: true, accessorFn: (x) => x.conversions ?? -1, meta: { align: 'r', hideSm: true }, cell: (x) => (x.conversions == null ? <span className="muted">–</span> : fmtInt(x.conversions)) },
        { id: 'last', header: 'Last crawled', sortDescFirst: true, accessorFn: (x) => x.lastCrawled ?? 0, meta: { align: 'r', hideSm: true }, cell: (x) => <span className="muted">{x.lastCrawled == null ? 'never' : ago(x.lastCrawled)}</span> },
      ]}
    />
  )
}
