// AI visibility → Agents (plan F-3): AI browsing agents that loaded the site and ran the script. They are left
// out of visitor numbers unless actor=all. Verified (signature, relayed signature, published IP list) and
// Claimed (user agent only) are shown apart, in the chart, the agent cards and every session row.
import type { AISetup, AgentPage, AgentSession } from '../../api/types'
import { api } from '../../api/client'
import { StackedBars } from '../../charts/StackedBars'
import { fmtDur, fmtInt, fmtPct } from '../../lib/format'
import { inWindow } from '../../lib/phrases'
import { navigate } from '../../state/useUrlState'
import { DeltaPill } from '../../ui/delta-pill'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import LazyTable from '../activity/LazyTable'
import { BarCell, Lede, Method, Stat, StatStrip, maxOf, useReport } from '../conversions/kit'
import { AgentBadge } from './AgentBadge'
import { ago, monogram } from './util'

/** Set from the agent-signature spike (plan I-1). Verdict pending: the server-hook copy. */
export const CHATGPT_NOTE =
  'ChatGPT agent signs only page requests. Run npx trail-analytics init so your server can pass the signature to Trail; without it, ChatGPT agent looks like a person.'

const KEYS = [
  { key: 'verified', label: 'Verified', color: 'var(--chart-1)' },
  { key: 'claimed', label: 'Claimed', color: 'var(--chart-3)' },
]

export function listsLine(setup: AISetup | undefined): string {
  const ok = (setup?.lists ?? []).filter((l) => l.ok && l.fetchedAt != null)
  if (!ok.length) return 'Lists unavailable: agents are identified by user agent only.'
  const oldest = Math.min(...ok.map((l) => l.fetchedAt as number))
  return `Lists updated ${ago(oldest)}.`
}

export function AgentsTab({ domain, setup }: { domain: string; setup: AISetup | undefined }) {
  const r = useReport('agents', (q, sig) => api.agents(q, sig))
  const s = r.s
  if (r.error && !r.data) return <ErrorState onRetry={r.refetch} />
  if (!r.data)
    return (
      <div className="f4" aria-busy="true">
        <Skeleton height={96} />
        <Skeleton height={240} />
      </div>
    )
  const d = r.data
  const w = d.window
  const cmpOn = s.cmp !== 'none' && !w.basis.none && d.prevSessions != null
  const counted = s.actor === 'all'
  const method = (
    <Method>
      Trail recognises an agent by a Web Bot Auth signature on the request, a signed request your server hook saw for the same browser, the operator’s published IP
      list, or, weakest, its user agent (Claimed). {listsLine(setup)} Agents that run inside a person’s own browser (for example Perplexity Comet or Claude in Chrome)
      look like that person and are not detected. {CHATGPT_NOTE}
    </Method>
  )

  if (d.sessions === 0)
    return (
      <div className="f4">
        <div className="panel">
          <EmptyState
            title={`No AI agents ${inWindow(w)}`}
            body={`AI browsing agents such as Claude agent and Google-Agent appear here when they load ${domain} and run your script. Nothing to set up: Trail reads them from the requests your script already sends.`}
          />
        </div>
        {method}
      </div>
    )

  const vShare = d.sessions ? d.verifiedSessions / d.sessions : 0
  const maxPv = maxOf(d.pages, (p) => p.pageviews)
  return (
    <div className="f4">
      <Lede>
        AI browsing agents that loaded {domain} and ran your script {inWindow(w)}.{' '}
        {counted ? 'They are counted as visitors right now.' : 'They are left out of visitor numbers.'}
      </Lede>
      <StatStrip n={4}>
        <Stat
          k="Agent sessions"
          v={fmtInt(d.sessions)}
          s={cmpOn ? <DeltaPill cur={d.sessions} prev={d.prevSessions} kind="count" goodWhen="flat" basis={w.basis} /> : `${fmtInt(d.agents.length)} ${d.agents.length === 1 ? 'agent' : 'agents'}`}
        />
        <Stat k="Pages viewed" v={fmtInt(d.pageviews)} s={`${(d.pageviews / d.sessions).toFixed(1)} per session`} />
        <Stat k="Verified share" v={fmtPct(vShare)} s={`${fmtInt(d.verifiedSessions)} of ${fmtInt(d.sessions)} sessions`} />
        <Stat k="Goal completions" v={d.conv ? fmtInt(d.conversions) : '–'} s={d.conv ? `reached “${d.conv.name}”` : 'no goal on this site yet'} />
      </StatStrip>
      <div className="chart-card">
        <div className="readout">
          <div className="big">
            <span className="when">Agent sessions · {inWindow(w)}</span>
            <span className="v">{fmtInt(d.sessions)}</span>
          </div>
          <span className="spacer" />
          <div className="legend-keys">
            {KEYS.map((c) => (
              <span key={c.key} className="k">
                <span className="sw" style={{ background: c.color }} aria-hidden="true" />
                {c.label}
              </span>
            ))}
          </div>
        </div>
        <StackedBars
          series={d.series.map((p) => ({ t: p.t, values: { verified: p.verified, claimed: p.claimed } }))}
          keys={KEYS}
          window={w}
          height={180}
          ariaLabel={`AI agent sessions per ${w.bucket}, verified and claimed`}
        />
      </div>
      <section aria-labelledby="agents-h" className="f4" style={{ gap: 10 }}>
        <h2 id="agents-h" className="ai-h2">
          Agents
        </h2>
        <div className="prov-groups">
          {d.agents.map((a) => (
            <div key={a.agent} className="prov-card">
              <h3>
                <span className="prov">
                  <span className="pm" aria-hidden="true">
                    {monogram(a.provider)}
                  </span>
                  <span>
                    {a.name}
                    <span className="agent-prov">{a.provider}</span>
                  </span>
                </span>
                <span className="n">
                  {fmtInt(a.sessions)}
                  <span className="sr-only"> sessions</span>
                </span>
              </h3>
              <ul>
                <li>
                  <span className="catdot" style={{ background: KEYS[0].color }} aria-hidden="true" />
                  Verified
                  <span className="n">{fmtInt(a.verified)}</span>
                </li>
                <li>
                  <span className="catdot" style={{ background: KEYS[1].color }} aria-hidden="true" />
                  Claimed
                  <span className="n">{fmtInt(a.sessions - a.verified)}</span>
                </li>
                <li>
                  Pages viewed <span className="n">{fmtInt(a.pageviews)}</span>
                </li>
                <li>
                  Last seen <span className="n">{ago(a.lastSeen)}</span>
                </li>
              </ul>
            </div>
          ))}
        </div>
      </section>
      <LazyTable<AgentSession>
        noun="sessions"
        nounOne="session"
        caption="Latest agent sessions"
        data={d.latest}
        initialSort={{ id: 'start', desc: true }}
        getSearchText={(x) => `${x.name} ${x.provider} ${x.entry}`}
        getRowLabel={(x) => `${x.name}, ${ago(x.start)}, entered on ${x.entry}. Open the journey`}
        onRowOpen={(x) => navigate({ sheet: { kind: 'journey', person: x.person, session: x.sessionId } })}
        emptyState={<EmptyState title="No agent sessions" />}
        columns={[
          {
            id: 'agent',
            header: 'Agent',
            enableHiding: false,
            accessorFn: (x) => x.name,
            cell: (x) => (
              <span className="agent-cell">
                <b className="font-medium">{x.name}</b>
                <AgentBadge via={x.via} provider={x.provider} />
              </span>
            ),
          },
          { id: 'entry', header: 'Entry page', accessorFn: (x) => x.entry, meta: { hideSm: true }, cell: (x) => <span className="mono">{x.entry}</span> },
          { id: 'pages', header: 'Pages', sortDescFirst: true, accessorFn: (x) => x.pages, meta: { align: 'r' }, cell: (x) => fmtInt(x.pages) },
          { id: 'dur', header: 'Time', sortDescFirst: true, accessorFn: (x) => x.durationMs, meta: { align: 'r', hideSm: true }, cell: (x) => fmtDur(x.durationMs) },
          { id: 'goals', header: 'Goals', sortDescFirst: true, accessorFn: (x) => x.goals, meta: { align: 'r', hideSm: true }, cell: (x) => fmtInt(x.goals) },
          { id: 'start', header: 'Started', sortDescFirst: true, accessorFn: (x) => x.start, meta: { align: 'r' }, cell: (x) => <span className="muted">{ago(x.start)}</span> },
        ]}
      />
      <LazyTable<AgentPage>
        noun="pages"
        nounOne="page"
        caption="Pages agents viewed"
        data={d.pages}
        initialSort={{ id: 'pv', desc: true }}
        getSearchText={(x) => `${x.path} ${x.topAgent}`}
        emptyState={<EmptyState title="No pages viewed by agents" />}
        columns={[
          { id: 'path', header: 'Page', enableHiding: false, accessorFn: (x) => x.path, cell: (x) => <b className="mono font-medium">{x.path}</b> },
          { id: 'top', header: 'Top agent', accessorFn: (x) => x.topAgent, meta: { hideSm: true } },
          { id: 'sessions', header: 'Sessions', sortDescFirst: true, accessorFn: (x) => x.sessions, meta: { align: 'r', hideSm: true }, cell: (x) => fmtInt(x.sessions) },
          { id: 'pv', header: 'Pageviews', sortDescFirst: true, accessorFn: (x) => x.pageviews, meta: { align: 'r' }, cell: (x) => <BarCell value={x.pageviews} max={maxPv}>{fmtInt(x.pageviews)}</BarCell> },
        ]}
      />
      {method}
    </div>
  )
}
