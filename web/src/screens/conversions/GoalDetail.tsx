// Goal detail (Task F4-2): the trend against the earlier period, Sources and Landing pages by FIRST TOUCH
// (converters add up to the goal's people; revenue matches the Revenue screen row for row), and the paths
// that lead here. A stale id shows "This goal no longer exists".
import { useState } from 'react'
import { ArrowRight, ChevronLeft, Filter, Pencil, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import type { FirstTouchRow, Goal } from '../../api/types'
import { invalidate } from '../../api/useQuery'
import { LineChart } from '../../charts/LineChart'
import { rowLabel } from '../../data/columns'
import type { TableColumn } from '../../data/DataTable'
import { fmtInt, fmtMoney, fmtPct } from '../../lib/format'
import { inWindow } from '../../lib/phrases'
import { navigate } from '../../state/useUrlState'
import { RouteLink } from '../../shell/RouteLink'
import { useShowRevenue, useSite } from '../../shell/useSite'
import { useStats } from '../../shell/useStats'
import { writeFailed } from '../../shell/writes'
import { Button } from '../../ui/button'
import { DeltaPill } from '../../ui/delta-pill'
import { Dialog } from '../../ui/dialog'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { Tabs } from '../../ui/tabs'
import LazyTable from '../activity/LazyTable'
import { GoalDialog } from './GoalDialog'
import { baseOf } from './Goals'
import { BarCell, Lede, Method, Stat, StatStrip, StaleState, isNotFound, maxOf, useReport } from './kit'

type GTab = 'overview' | 'sources' | 'pages'

function FirstTouchTable({ rows, dim, goal, revenue, currency, converters }: { rows: FirstTouchRow[]; dim: 'source' | 'entry'; goal: Goal; revenue: boolean; currency: string; converters: number }) {
  const max = maxOf(rows, (r) => r.converted)
  const what = dim === 'source' ? 'source' : 'landing page'
  const cols: TableColumn<FirstTouchRow>[] = [
    {
      id: 'name',
      header: dim === 'source' ? 'First-touch source' : 'First landing page',
      enableHiding: false,
      accessorFn: (r) => rowLabel(dim, r.key),
      cell: (r) => <b className={dim === 'entry' ? 'mono font-medium' : 'font-medium'}>{rowLabel(dim, r.key)}</b>,
    },
    {
      id: 'conv',
      header: 'Converted',
      accessorFn: (r) => r.converted,
      meta: { align: 'r', definition: `People who reached ${goal.name}, credited to the ${what} of their first visit ever.` },
      cell: (r) => <BarCell value={r.converted} max={max}>{fmtInt(r.converted)}</BarCell>,
    },
    { id: 'share', header: '% of converters', accessorFn: (r) => r.share, meta: { align: 'r', hideSm: true }, cell: (r) => fmtPct(r.share) },
    { id: 'visitors', header: 'Visitors', accessorFn: (r) => r.visitors, meta: { align: 'r', hideSm: true, definition: `Visitors whose first visit came from this ${what}.` }, cell: (r) => fmtInt(r.visitors) },
    {
      id: 'rate',
      header: 'Conversion rate',
      accessorFn: (r) => r.rate,
      meta: { align: 'r', definition: `Converted ÷ visitors whose first visit came from this ${what}. * marks fewer than 20 visitors.` },
      cell: (r) => (
        <>
          {fmtPct(r.rate)}
          {r.lowBase && (
            <span className="subtle" title="Fewer than 20 visitors: treat this rate as a hint">
              {' '}
              *<span className="sr-only"> fewer than 20 visitors, a hint only</span>
            </span>
          )}
        </>
      ),
    },
  ]
  if (revenue)
    cols.push({
      id: 'revenue',
      header: 'Revenue (first touch)',
      accessorFn: (r) => r.revenueMinor,
      meta: { align: 'r', hideSm: true, definition: 'Purchases reported by your site, credited to where the buyer first came from.' },
      cell: (r) => fmtMoney(r.revenueMinor, currency),
    })
  return (
    <>
      <LazyTable<FirstTouchRow>
        noun={dim === 'source' ? 'sources' : 'landing pages'}
        nounOne={what}
        caption={`${goal.name} by first touch ${what}`}
        data={rows}
        total={rows.length}
        initialSort={{ id: 'conv', desc: true }}
        getSearchText={(r) => rowLabel(dim, r.key)}
        onRowOpen={(r) => navigate({ sheet: { kind: 'row', dim, key: r.key } })}
        emptyState={<EmptyState title={`Nobody reached ${goal.name} in this range`} body="Converters show up here by where they first came from." />}
        columns={cols}
      />
      <Method>
        {converters > 0 ? `${fmtInt(rows.reduce((a, r) => a + r.converted, 0))} of ${fmtInt(converters)} converters are listed. ` : ''}* fewer than 20 visitors from that {what}, so the rate can swing a lot. Overview’s Sources panel counts every visit from a
        source in the range instead (any touch), and says so.
      </Method>
    </>
  )
}

export function GoalDetail({ id, share }: { id: number; share: boolean }) {
  const d = useReport(`goal:${id}`, (q, sig) => api.goalDetail(q, id, sig), { dropGoal: true })
  const paths = useReport(`paths:${id}`, (q, sig) => api.paths(q, id, sig), { dropGoal: true })
  const stats = useStats()
  const revenue = useShowRevenue()
  const { site } = useSite()
  const [tab, setTab] = useState<GTab>('overview')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const s = d.s
  const back = { screen: 'conversions' as const, tab: 'goals', id: null, sheet: null }

  if (isNotFound(d.error)) return <StaleState title="This goal no longer exists" back={back} backLabel="Back to all goals" />
  if (d.error && !d.data) return <ErrorState onRetry={d.refetch} />
  if (!d.data)
    return (
      <div className="f4" aria-busy="true">
        <Skeleton height={28} width="40%" />
        <Skeleton height={96} />
        <Skeleton height={220} />
      </div>
    )

  const { goal, cur, prev, byVisit } = d.data
  const w = stats.data?.window
  const basis = w?.basis
  const cmpOn = s.cmp !== 'none' && !!basis && !basis.none && prev != null
  const visits = byVisit.first + byVisit.second + byVisit.later
  const goalFiltered = s.filters.some((f) => f.dim === 'goal')
  const currency = site?.features?.currency || 'USD'

  const remove = async () => {
    try {
      await api.deleteGoal(s.site, goal.id)
      invalidate('f4|')
      navigate(back)
    } catch (e) {
      writeFailed(e)
    }
  }

  return (
    <div className="f4">
      <div className="goal-head">
        <RouteLink className="btn btn-sm btn-ghost" patch={back}>
          <ChevronLeft size={14} aria-hidden="true" />
          All goals
        </RouteLink>
        <span className="goal-ring" aria-hidden="true" />
        <h2 className="m-0">
          <b className="name">{goal.name}</b>
        </h2>
        <span className="chip">
          <span className="k">{goal.kind}</span>
          <span className={goal.kind === 'page' ? 'v mono' : 'v'}>{goal.match}</span>
        </span>
        <span className="spacer" />
        {!share && (
          <>
            <Button size="sm" onClick={() => navigate({ filters: [...s.filters.filter((f) => f.dim !== 'goal'), { dim: 'goal', value: goal.name }] })}>
              <Filter size={14} aria-hidden="true" />
              Filter to people who reached it
            </Button>
            <Button size="sm" aria-label={`Edit ${goal.name}`} onClick={() => setEditing(true)}>
              <Pencil size={14} aria-hidden="true" />
              Edit
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Delete ${goal.name}`} onClick={() => setDeleting(true)}>
              <Trash2 size={14} aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
      <div className="sub-tabs">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as GTab)}
          ariaLabel="Goal views"
          idBase="gt"
          items={[
            { value: 'overview', label: 'Overview' },
            { value: 'sources', label: 'Sources' },
            { value: 'pages', label: 'Landing pages' },
          ]}
        />
      </div>
      <div role="tabpanel" id={`gt-${tab}-panel`} aria-labelledby={`gt-${tab}`} className="f4">
        {tab === 'overview' ? (
          <>
            <StatStrip>
              <Stat
                k="Completions"
                v={fmtInt(cur.conversions)}
                s={cmpOn && basis ? <DeltaPill cur={cur.conversions} prev={prev!.conversions} kind="count" goodWhen="up" basis={basis} /> : 'every time it happened'}
              />
              <Stat k="Converted visitors" v={fmtInt(cur.visitors)} s={`of ${fmtInt(baseOf(cur))} visitors`} />
              <Stat
                k="Conversion rate"
                v={fmtPct(cur.rate)}
                s={cmpOn && basis ? <DeltaPill cur={cur.rate} prev={prev!.rate} kind="rate" goodWhen="up" basis={basis} n={baseOf(prev!)} /> : undefined}
              />
              <Stat
                k="Converted on visit 1"
                v={visits ? fmtPct(byVisit.first / visits) : 'n/a'}
                s={visits ? `${fmtPct(byVisit.second / visits)} on visit 2 · ${fmtPct(byVisit.later / visits)} later` : 'nobody converted yet'}
              />
            </StatStrip>
            {w && (
              <div className="chart-card">
                <div className="readout">
                  <div className="big">
                    <span className="when">People who converted · {inWindow(w)}</span>
                    <span className="v">{fmtInt(cur.visitors)}</span>
                  </div>
                  <span className="spacer" />
                  <div className="legend-keys" aria-hidden="true">
                    <span className="k">
                      <span className="sw" style={{ background: 'var(--goal)' }} />
                      Converted per {w.bucket}
                    </span>
                    {cmpOn && basis && (
                      <span className="k">
                        <span className="sw prev" />
                        {basis.dates}
                      </span>
                    )}
                  </div>
                </div>
                <LineChart
                  points={d.data.series}
                  prev={cmpOn ? d.data.prevSeries : undefined}
                  window={w}
                  color="var(--goal)"
                  height={200}
                  kind="count"
                  ariaLabel={`${goal.name}: people who converted per ${w.bucket}`}
                />
              </div>
            )}
            <section className="panel" aria-labelledby="paths-h">
              <div className="panel-h">
                <h2 id="paths-h">Paths that lead here</h2>
                <span className="spacer" />
                <RouteLink className="btn btn-sm btn-ghost" patch={{ screen: 'activity', tab: 'paths', id: null, sheet: null }}>
                  All paths <ArrowRight size={14} aria-hidden="true" />
                </RouteLink>
              </div>
              {paths.data && paths.data.rows.length > 0 ? (
                <ol className="path-rows">
                  {paths.data.rows.slice(0, 5).map((p, i) => (
                    <li key={i} className="path-row">
                      <span className="trail">
                        {p.steps.map((x, k) => (
                          <span key={k} className="contents">
                            {k > 0 && (
                              <span className="ft" aria-hidden="true">
                                <i />
                                <i />
                                <i />
                              </span>
                            )}
                            <span className={k ? 'stp' : 'stp src'}>{k ? x : `from ${rowLabel('source', x)}`}</span>
                          </span>
                        ))}
                      </span>
                      <span className="num">
                        <b>{fmtInt(p.people)}</b>
                        <span>{fmtPct(p.share)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState title={paths.data ? 'No paths yet' : 'Loading paths…'} body={paths.data ? `Nobody reached ${goal.name} ${inWindow({ key: s.range })}.` : undefined} />
              )}
            </section>
          </>
        ) : (
          <>
            <Lede>
              People who reached {goal.name} {inWindow({ key: s.range })}, by the {tab === 'sources' ? 'source' : 'landing page'} of <b>their first visit ever</b> (first
              touch, the same model as revenue everywhere in Trail). The rate is converters ÷ visitors whose first visit came from that {tab === 'sources' ? 'source' : 'page'}.
              {goalFiltered && ' The goal filter is ignored here so rates stay meaningful.'}
            </Lede>
            <FirstTouchTable
              key={tab}
              rows={tab === 'sources' ? d.data.sources : d.data.landings}
              dim={tab === 'sources' ? 'source' : 'entry'}
              goal={goal}
              revenue={revenue}
              currency={currency}
              converters={cur.visitors}
            />
          </>
        )}
      </div>
      {!share && (
        <>
          <GoalDialog open={editing} onOpenChange={setEditing} site={s.site} goal={goal} />
          <Dialog open={deleting} onOpenChange={setDeleting} title={`Delete ${goal.name}?`} description="The goal and its numbers go away. Events stay; you can add the goal again later." size="sm">
            <div className="f4-acts">
              <Button onClick={() => setDeleting(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove()}>
                Delete goal
              </Button>
            </div>
          </Dialog>
        </>
      )}
    </div>
  )
}
