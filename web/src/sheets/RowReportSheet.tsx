// The row report (dr=dim|key, Task F2-5): this row's numbers vs the basis (the dashboard's filters plus this
// row), its trend with the previous period dashed, two related breakdowns, the 4 latest visitors and a
// "Filter dashboard" button. It reads the URL itself.
import { api } from '../api/client'
import type { Dim, Person, Series, Stats } from '../api/types'
import { useQuery } from '../api/useQuery'
import { LineChart } from '../charts/LineChart'
import { BarList } from '../data/BarList'
import { columnCatalog, toRows } from '../data/columns'
import { toggleFilter } from '../data/Panel'
import { fmtDur, fmtInt, fmtPct } from '../lib/format'
import { visitsText } from '../lib/journey'
import { DIM_LABEL, valueLabel, viewerTz } from '../shell/labels'
import { useSite } from '../shell/useSite'
import { apiQuery } from '../state/url'
import { navigate, useUrlState } from '../state/useUrlState'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { DeltaPill } from '../ui/delta-pill'
import { Sheet } from '../ui/dialog'
import { ErrorState, Skeleton } from '../ui/states'
import '../data/data.css'

/** Two breakdowns that explain a row, per dim. */
export const RELATED: Partial<Record<Dim, [Dim, string][]>> = {
  path: [['source', 'Top sources'], ['entry', 'Came in on']],
  route: [['source', 'Top sources'], ['entry', 'Came in on']],
  host: [['path', 'Pages'], ['source', 'Top sources']],
  entry: [['source', 'Top sources'], ['exit', 'Left from']],
  exit: [['entry', 'Came in on'], ['source', 'Top sources']],
  source: [['entry', 'Landing pages'], ['country', 'Countries']],
  referrer: [['entry', 'Landing pages'], ['country', 'Countries']],
  channel: [['source', 'Sources'], ['entry', 'Landing pages']],
  ai_source: [['entry', 'Landing pages'], ['country', 'Countries']],
  utm_campaign: [['entry', 'Landing pages'], ['country', 'Countries']],
  utm_source: [['entry', 'Landing pages'], ['country', 'Countries']],
  utm_medium: [['source', 'Sources'], ['entry', 'Landing pages']],
  utm_term: [['entry', 'Landing pages'], ['source', 'Sources']],
  utm_content: [['entry', 'Landing pages'], ['source', 'Sources']],
  country: [['city', 'Cities'], ['source', 'Top sources']],
  region: [['city', 'Cities'], ['source', 'Top sources']],
  city: [['entry', 'Landing pages'], ['source', 'Top sources']],
  device: [['browser', 'Browsers'], ['source', 'Top sources']],
  browser: [['os', 'Operating systems'], ['device', 'Devices']],
  os: [['browser', 'Browsers'], ['device', 'Devices']],
  event: [['path', 'On pages'], ['source', 'Top sources']],
  goal: [['source', 'Top sources'], ['entry', 'Landing pages']],
  dow: [['source', 'Top sources'], ['entry', 'Landing pages']],
  hour: [['source', 'Top sources'], ['entry', 'Landing pages']],
}

export function RowReportSheet() {
  const s = useUrlState()
  const sheet = s.sheet?.kind === 'row' ? s.sheet : null
  const title = sheet ? `${DIM_LABEL[sheet.dim]}: ${valueLabel(sheet.dim, sheet.key)}` : 'Row report'
  return (
    <Sheet open={!!sheet} onOpenChange={(o) => !o && navigate({ sheet: null })} title={title} size="wide">
      {sheet && <RowReport dim={sheet.dim} rowKey={sheet.key} />}
    </Sheet>
  )
}

function RowReport({ dim, rowKey }: { dim: Dim; rowKey: string }) {
  const s = useUrlState()
  const { share } = useSite()
  const filters = toggleFilter(s.filters.filter((f) => !(f.dim === dim && f.value === rowKey)), dim, rowKey)
  const rq = apiQuery({ ...s, filters }, viewerTz())
  const key = `${rq}|${s.prefix}`
  const stats = useQuery<Stats>(`stats|${key}`, async (sig) => api.stats(rq, sig), { keepPrevious: false })
  const series = useQuery<Series>(`series|visitors|${key}`, async (sig) => api.series(rq, 'visitors', true, sig), { keepPrevious: false })
  const people = useQuery(`visitors4|${key}`, async (sig) => api.visitors(rq, { limit: 4 }, sig), { keepPrevious: false })
  const active = s.filters.some((f) => f.dim === dim && f.value === rowKey)
  const st = stats.data
  const basis = st?.window.basis
  const tiles = st
    ? ([
        ['Visitors', fmtInt(st.visitors), st.visitors, st.prev?.visitors ?? null, 'count', 'up', undefined],
        ['Page views', fmtInt(st.pageviews), st.pageviews, st.prev?.pageviews ?? null, 'count', 'up', undefined],
        ['Sessions', fmtInt(st.sessions), st.sessions, st.prev?.sessions ?? null, 'count', 'up', undefined],
        ['Bounce rate', fmtPct(st.bounce), st.bounce, st.prev?.bounce ?? null, 'rate', 'down', st.prev?.sessions],
        ['Avg. session', fmtDur(st.durationMs), st.durationMs, st.prev?.durationMs ?? null, 'duration', 'up', st.prev?.sessions],
      ] as const)
    : []
  return (
    <div className="rr">
      {stats.error && !st ? (
        <ErrorState onRetry={stats.refetch} />
      ) : !st ? (
        <div aria-busy="true">
          <Skeleton height={80} />
        </div>
      ) : (
        <div className="rr-stats">
          {tiles.map(([label, text, cur, prev, kind, good, n]) => (
            <div key={label}>
              <div className="k">{label}</div>
              <div className="v">{text}</div>
              {basis && !basis.none && <DeltaPill cur={cur} prev={prev} kind={kind} goodWhen={good} basis={basis} n={n ?? undefined} />}
            </div>
          ))}
        </div>
      )}
      {!share && (
        <div className="rr-acts">
          <Button size="sm" variant={active ? 'secondary' : 'primary'} onClick={() => navigate({ filters: toggleFilter(s.filters, dim, rowKey), sheet: null })}>
            {active ? 'Remove the filter' : 'Filter dashboard'}
          </Button>
        </div>
      )}
      <section className="rr-sec" aria-label="Trend">
        <h3>Visitors per {series.data?.window.bucket ?? 'day'}</h3>
        {series.data ? (
          <LineChart
            points={series.data.points}
            prev={series.data.window.basis.none ? undefined : series.data.prev}
            window={series.data.window}
            color="var(--chart-1)"
            height={180}
            kind="count"
            ariaLabel={`Visitors per ${series.data.window.bucket}`}
          />
        ) : (
          <Skeleton height={180} />
        )}
      </section>
      <div className="rr-two">
        {(RELATED[dim] ?? []).map(([d, label]) => (
          <Related key={d} dim={d} label={label} q={rq} qkey={key} />
        ))}
      </div>
      <section className="rr-sec" aria-labelledby="rr-people">
        <h3 id="rr-people">Latest visitors</h3>
        {people.data?.rows.length ? (
          <ul className="rr-people">
            {people.data.rows.map((p: Person) => (
              <li key={p.person}>
                <button type="button" onClick={() => navigate({ sheet: { kind: 'journey', person: p.person } })}>
                  <Avatar seed={p.person} size={20} />
                  <span data-testid="journey-label">{p.label}</span>
                  <span className="subtle">
                    {visitsText(p)} · {valueLabel('source', p.source)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : people.loading ? (
          <Skeleton height={80} />
        ) : (
          <p className="muted">Nobody in this range.</p>
        )}
      </section>
    </div>
  )
}

function Related({ dim, label, q, qkey }: { dim: Dim; label: string; q: URLSearchParams; qkey: string }) {
  const r = useQuery(`breakdown|${dim}|${qkey}`, async (sig) => api.breakdown(q, dim, { limit: 5 }, sig), { keepPrevious: false })
  const cat = columnCatalog()
  const rows = toRows((r.data?.rows ?? []).slice(0, 5), dim, cat.visitors, null)
  return (
    <section className="rr-sec" aria-label={label}>
      <h3>{label}</h3>
      {r.data ? (
        rows.length ? (
          <BarList rows={rows} columns={[cat.visitors]} onOpen={(row) => navigate({ sheet: { kind: 'row', dim: row.dim, key: row.key } })} />
        ) : (
          <p className="muted">Nothing in this range.</p>
        )
      ) : (
        <Skeleton height={120} />
      )}
    </section>
  )
}
