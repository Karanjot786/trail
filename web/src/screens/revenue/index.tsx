// Revenue (Task F4-5): reported by your site (Purchase events), credited by FIRST TOUCH, so Acquisition, goals
// and this screen agree row for row. Purchases are discrete, so the chart is daily bars; a day without
// purchases reads "No purchases". Hidden, with the one-line setup, until the site sends a Purchase.
import { useState } from 'react'
import { api } from '../../api/client'
import type { Purchase, RevenueRow } from '../../api/types'
import { BarsChart } from '../../charts/BarsChart'
import { bucketLabel } from '../../charts/labels'
import { rowLabel } from '../../data/columns'
import { bar } from '../../lib/bar'
import { fmtInt, fmtMoney } from '../../lib/format'
import { inWindow } from '../../lib/phrases'
import { navigate } from '../../state/useUrlState'
import { useShowRevenue, useSite } from '../../shell/useSite'
import { useStats } from '../../shell/useStats'
import { DeltaPill } from '../../ui/delta-pill'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { Badge } from '../../ui/small'
import { Segmented } from '../../ui/tabs'
import { InfoHint } from '../../ui/tooltip'
import LazyTable from '../activity/LazyTable'
import { Lede, Method, Stat, StatStrip, maxOf, useReport } from '../conversions/kit'
import { Hidden } from './Hidden'

type RDim = 'source' | 'channel' | 'campaign' | 'entry' | 'country' | 'device'
const DIMS: { value: RDim; label: string }[] = [
  { value: 'source', label: 'Source' },
  { value: 'channel', label: 'Channel' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'entry', label: 'Landing page' },
  { value: 'country', label: 'Country' },
  { value: 'device', label: 'Device' },
]
const rowDim = { source: 'source', channel: 'channel', campaign: 'utm_campaign', entry: 'entry', country: 'country', device: 'device' } as const

const when = (ms: number, tz: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(ms)
  } catch {
    return new Date(ms).toISOString().slice(0, 16)
  }
}

function Breakdown({ currency, net }: { currency: string; net: number }) {
  const [dim, setDim] = useState<RDim>('source')
  const r = useReport(`revenue-breakdown:${dim}`, (q, sig) => api.revenueBreakdown(q, dim, { limit: 1000 }, sig))
  const rows: RevenueRow[] = r.data?.rows ?? []
  const max = maxOf(rows, (x) => x.revenueMinor)
  const sum = rows.reduce((a, x) => a + x.revenueMinor, 0)
  const label = (k: string) => (dim === 'campaign' && !k ? 'No campaign (untagged)' : rowLabel(rowDim[dim], k))
  const head = DIMS.find((d) => d.value === dim)!.label
  return (
    <section className="panel" aria-labelledby="rev-by-h">
      <div className="panel-h" style={{ flexWrap: 'wrap', paddingBottom: 6 }}>
        <h2 id="rev-by-h" className="sr-only">
          Revenue by first touch {head.toLowerCase()}
        </h2>
        <Segmented value={dim} onValueChange={(v) => setDim(v as RDim)} items={DIMS} ariaLabel="Credit revenue to" />
        <span className="spacer" />
        <Badge>First touch</Badge>
      </div>
      {r.error && !r.data ? (
        <ErrorState onRetry={r.refetch} />
      ) : !r.data ? (
        <div className="p-4">
          <Skeleton height={120} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={`No purchases ${inWindow({ key: r.s.range })}`} body="Purchases appear when your checkout sends a Purchase event with an amount." />
      ) : (
        <ul className="rev-rows" aria-label={`Revenue by first touch ${head.toLowerCase()}`}>
          <li className="colhead" aria-hidden="true">
            <span>{head}</span>
            <span />
            <span className="c">Buyers</span>
            <span className="c">Purchases</span>
            <span className="c">Revenue</span>
          </li>
          {rows.map((x) => {
            const f = bar(x.revenueMinor, max)
            return (
              <li key={x.key} data-rev={x.revenueMinor}>
                <span className={`name${dim === 'entry' || dim === 'campaign' ? ' mono' : ''}`} title={label(x.key)}>
                  {label(x.key)}
                </span>
                <span className="barwrap" aria-hidden="true">
                  <i data-bar="" style={{ transform: `scaleX(${Number(f.toFixed(4))})` }} />
                </span>
                <span className="c">
                  {fmtInt(x.buyers)}
                  <span className="sr-only"> buyers</span>
                </span>
                <span className="c">
                  {fmtInt(x.purchases)}
                  <span className="sr-only"> purchases</span>
                </span>
                <span className="c">{fmtMoney(x.revenueMinor, currency)}</span>
              </li>
            )
          })}
          <li className="rev-total" data-testid="rev-total">
            <span>Total</span>
            <span />
            <span />
            <span />
            <span className="c">{fmtMoney(sum, currency)}</span>
          </li>
        </ul>
      )}
      {r.data && rows.length > 0 && sum !== net && (
        <p className="panel-def">Rows add up to {fmtMoney(sum, currency)}; the rest has no recorded first touch.</p>
      )}
    </section>
  )
}

export default function RevenueScreen() {
  const { site, share } = useSite()
  const show = useShowRevenue()
  const stats = useStats()
  const rv = useReport('revenue', (q, sig) => api.revenue(q, sig), { enabled: show })
  const s = rv.s
  const w = stats.data?.window

  if (s.site === 'all') return <EmptyState title="Pick a website" body="Revenue reports one website at a time. Choose one in the switcher at the top left." />
  if (!site && !share) return <Skeleton height={240} />
  if (!show) return <Hidden domain={site?.domain ?? s.site} shareHidden={!!share && site?.features?.revenue !== false} />
  if (rv.error && !rv.data) return <ErrorState onRetry={rv.refetch} />
  if (!rv.data)
    return (
      <div className="f4" aria-busy="true">
        <Skeleton height={96} />
        <Skeleton height={240} />
      </div>
    )

  const d = rv.data
  const cur = d.currency || site?.features?.currency || 'USD'
  const basis = w?.basis
  const cmpOn = s.cmp !== 'none' && !!basis && !basis.none && d.prev != null
  const money = (m: number) => fmtMoney(m, cur)
  const pill = (c: number, p: number | undefined, kind: 'money' | 'count', n?: number) =>
    cmpOn && basis && p != null ? <DeltaPill cur={c} prev={p} kind={kind} goodWhen="up" basis={basis} n={n} /> : null
  const buys = new Map<number, number>()
  if (w) for (const p of d.purchases) {
    const i = d.series.findIndex((pt, k) => p.ts >= pt.t && (k === d.series.length - 1 || p.ts < d.series[k + 1].t))
    if (i >= 0) buys.set(i, (buys.get(i) ?? 0) + 1)
  }

  return (
    <div className="f4">
      <p className="m-0 flex items-center gap-2 text-small text-muted" data-testid="revenue-caption">
        Revenue reported by your site (Purchase events) · first touch
        <InfoHint label="About revenue reported by your site">
          Trail adds up the Purchase events your site sends, with their amount and currency. Verified revenue from payment providers is not part of this version, so treat
          these as the numbers your checkout reported.
        </InfoHint>
      </p>
      <Lede>
        From the <code>Purchase</code> event, with <code>amount</code> and <code>currency</code>. Amounts are in {cur}. Attribution is <b>first touch</b> everywhere in Trail: a
        purchase is credited to the source of the buyer’s first visit, so Acquisition, goals and this screen always agree.
      </Lede>
      <StatStrip>
        <Stat
          k="Net revenue"
          hint={<InfoHint label="Net revenue is reported by your site">The sum of Purchase amounts your site sent {inWindow(w ?? { key: s.range })}. Not verified with a payment provider.</InfoHint>}
          v={money(d.cur.netMinor)}
          s={pill(d.cur.netMinor, d.prev?.netMinor, 'money') ?? (d.cur.netMinor === 0 ? 'no purchases' : 'reported by your site')}
        />
        <Stat k="Purchases" v={fmtInt(d.cur.purchases)} s={d.cur.purchases ? pill(d.cur.purchases, d.prev?.purchases, 'count') : 'no purchases'} />
        <Stat k="Buyers" v={fmtInt(d.cur.buyers)} s={d.cur.purchases ? pill(d.cur.buyers, d.prev?.buyers, 'count') : 'no purchases'} />
        <Stat
          k="Avg. order"
          v={d.cur.purchases ? money(d.cur.aovMinor) : 'n/a'}
          s={d.cur.purchases ? pill(d.cur.aovMinor, d.prev?.aovMinor, 'money', d.prev?.purchases) : 'no purchases'}
        />
      </StatStrip>
      {d.otherCurrencyPurchases > 0 && (
        <Method>
          {fmtInt(d.otherCurrencyPurchases)} {d.otherCurrencyPurchases === 1 ? 'purchase' : 'purchases'} in other currencies {d.otherCurrencyPurchases === 1 ? 'is' : 'are'} not
          counted here. Trail adds up one currency per website: the most common one in this range ({cur}).
        </Method>
      )}
      {w && (
        <div className="chart-card">
          <div className="readout">
            <div className="big">
              <span className="when">Net revenue · {inWindow(w)}</span>
              <span className="v">
                {money(d.cur.netMinor)}
                {pill(d.cur.netMinor, d.prev?.netMinor, 'money')}
                {cmpOn && basis && <span className="pv">vs {money(d.prev!.netMinor)} · {basis.dates}</span>}
              </span>
            </div>
            <span className="spacer" />
            <div className="legend-keys" aria-hidden="true">
              <span className="k">
                <span className="sw" style={{ background: 'var(--chart-4)' }} />
                Revenue per {w.bucket}
              </span>
              {cmpOn && basis && (
                <span className="k">
                  <span className="sw prev" />
                  {basis.dates}
                </span>
              )}
            </div>
          </div>
          <BarsChart
            points={d.series}
            prev={cmpOn ? d.prevSeries : undefined}
            window={w}
            color="var(--chart-4)"
            height={180}
            money={cur}
            ariaLabel={`Net revenue per ${w.bucket}, as bars. Days without purchases have no bar`}
            describe={(i) => {
              const v = d.series[i]?.v
              const n = buys.get(i) ?? 0
              return `${bucketLabel(d.series[i].t, w)}: ${v ? `${money(v)}, ${n} ${n === 1 ? 'purchase' : 'purchases'}` : 'No purchases'}`
            }}
          />
        </div>
      )}
      <Breakdown currency={cur} net={d.cur.netMinor} />
      <section aria-labelledby="rev-p-h" className="f4" style={{ gap: 10 }}>
        <h2 id="rev-p-h" className="m-0 text-label font-semibold">
          Purchases
        </h2>
        <LazyTable<Purchase>
          noun="purchases"
          nounOne="purchase"
          caption="Purchases, newest first"
          data={d.purchases}
          initialSort={{ id: 'at', desc: true }}
          getSearchText={(p) => `${p.label} ${p.plan}`}
          onRowOpen={(p) => navigate({ sheet: { kind: 'journey', person: p.person, session: p.sessionId } })}
          emptyState={<EmptyState title={`No purchases ${inWindow({ key: s.range })}`} body="Purchases appear when your checkout sends a Purchase event with an amount." />}
          columns={[
            { id: 'who', header: 'Customer', enableHiding: false, accessorFn: (p) => p.label, cell: (p) => <b className="font-medium">{p.label}</b> },
            { id: 'plan', header: 'Plan', accessorFn: (p) => p.plan, cell: (p) => (p.plan ? <span className="chip"><span className="k">plan</span><span className="v">{p.plan}</span></span> : <span className="subtle">n/a</span>) },
            { id: 'visits', header: 'Visits before', accessorFn: (p) => p.visitsBefore, meta: { align: 'r', hideSm: true }, cell: (p) => fmtInt(p.visitsBefore) },
            { id: 'amount', header: 'Revenue', accessorFn: (p) => p.amountMinor, meta: { align: 'r' }, cell: (p) => money(p.amountMinor) },
            { id: 'at', header: 'Purchased', accessorFn: (p) => p.ts, meta: { align: 'r' }, cell: (p) => <span className="muted">{when(p.ts, w?.tz ?? 'UTC')}</span> },
          ]}
        />
      </section>
    </div>
  )
}
