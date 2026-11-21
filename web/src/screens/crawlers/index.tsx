// AI crawlers (Task F4-6): requests from known AI crawlers, read from server logs, by purpose. They never count
// as visitors. Stacked bars by category with direct labels, provider groups, and the requested pages.
import { api } from '../../api/client'
import type { CrawlCategory, Crawlers } from '../../api/types'
import { StackedBars } from '../../charts/StackedBars'
import { fmtInt, fmtPct } from '../../lib/format'
import { inWindow } from '../../lib/phrases'
import { useSite } from '../../shell/useSite'
import { DeltaPill } from '../../ui/delta-pill'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import LazyTable from '../activity/LazyTable'
import { BarCell, Lede, Method, Stat, StatStrip, maxOf, useReport } from '../conversions/kit'
import { Setup } from './Setup'

export const CATS: { key: CrawlCategory; label: string; color: string; def: string }[] = [
  { key: 'fetch', label: 'AI fetches', color: 'var(--chart-1)', def: 'An assistant fetched a page live because a person asked it something.' },
  { key: 'indexing', label: 'Indexing', color: 'var(--chart-2)', def: 'Crawlers that build an AI search index, so answers can cite your pages later.' },
  { key: 'training', label: 'Training', color: 'var(--chart-3)', def: 'Crawlers that collect pages to train models. Allow or block them in robots.txt.' },
  { key: 'general', label: 'General crawling', color: 'var(--chart-4)', def: 'Broad crawlers from large platforms whose purpose is not stated more precisely.' },
]
const cat = (k: CrawlCategory) => CATS.find((c) => c.key === k) ?? CATS[3]
const SINGLE_DAY = /^(today|yesterday|d:)/

const ago = (ms: number) => {
  const h = Math.max(0, Math.round((Date.now() - ms) / 3_600_000))
  return h < 1 ? 'within the hour' : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

type PageRow = Crawlers['pages'][number]

export default function CrawlersScreen() {
  const { site } = useSite()
  const r = useReport('crawlers', (q, sig) => api.crawlers(q, sig))
  const s = r.s

  if (s.site === 'all') return <EmptyState title="Pick a website" body="AI crawler data belongs to one website. Choose one in the switcher at the top left." />
  if (r.error && !r.data) return <ErrorState onRetry={r.refetch} />
  if (!r.data)
    return (
      <div className="f4" aria-busy="true">
        <Skeleton height={96} />
        <Skeleton height={240} />
      </div>
    )
  const d = r.data
  if (!d.configured) return <Setup site={s.site} origin={location.origin} />

  const w = d.window
  const basis = w.basis
  const cmpOn = s.cmp !== 'none' && !basis.none && d.prevTotal != null
  const widened = SINGLE_DAY.test(s.range)
  const max = maxOf(d.pages, (p) => p.requests)
  const byCat = new Map(d.categories.map((c) => [c.key, c]))
  const pages = new Set(d.pages.map((p) => p.path)).size

  return (
    <div className="f4">
      <Lede>
        Requests from known AI crawlers {inWindow(w)}, by what they do. They come from your server or proxy logs and never count as visitors.
        {widened && ' Showing the last 7 days: crawler data is daily.'}
      </Lede>
      <StatStrip n={5}>
        <Stat k="Requests" v={fmtInt(d.total)} s={cmpOn ? <DeltaPill cur={d.total} prev={d.prevTotal} kind="count" goodWhen="flat" basis={basis} /> : `${fmtInt(pages)} pages requested`} />
        {CATS.map((c) => {
          const x = byCat.get(c.key)
          return (
            <Stat
              key={c.key}
              k={
                <>
                  <span className="catdot" style={{ background: c.color }} aria-hidden="true" />
                  {c.label}
                </>
              }
              v={fmtInt(x?.requests ?? 0)}
              s={cmpOn && x ? <DeltaPill cur={x.requests} prev={x.prev} kind="count" goodWhen="flat" basis={basis} /> : d.total ? `${fmtPct((x?.requests ?? 0) / d.total)} of requests` : 'none yet'}
            />
          )
        })}
      </StatStrip>
      <div className="chart-card">
        <div className="readout">
          <div className="big">
            <span className="when">Requests · {inWindow(w)}</span>
            <span className="v">{fmtInt(d.total)}</span>
          </div>
          <span className="spacer" />
          <div className="legend-keys">
            {CATS.map((c) => (
              <span key={c.key} className="k">
                <span className="sw" style={{ background: c.color }} aria-hidden="true" />
                {c.label}
              </span>
            ))}
          </div>
        </div>
        <StackedBars
          series={d.series.map((p) => ({ t: p.t, values: { fetch: p.fetch, indexing: p.indexing, training: p.training, general: p.general } }))}
          keys={CATS.map((c) => ({ key: c.key, label: c.label, color: c.color }))}
          window={w}
          height={200}
          ariaLabel={`AI crawler requests per ${w.bucket} by purpose`}
        />
      </div>
      {d.providers.length > 0 && (
        <section aria-labelledby="prov-h" className="f4" style={{ gap: 10 }}>
          <h2 id="prov-h" className="m-0 text-label font-semibold">
            Providers
          </h2>
          <div className="prov-groups">
            {d.providers.map((p) => (
              <div key={p.provider} className="prov-card">
                <h3>
                  <span className="prov">
                    <span className="pm" aria-hidden="true">
                      {p.provider
                        .split(/\s+/)
                        .map((x) => x[0] ?? '')
                        .join('')
                        .slice(0, 2)}
                    </span>
                    {p.provider}
                  </span>
                  <span className="n">{fmtInt(p.crawlers.reduce((a, c) => a + c.requests, 0))}</span>
                </h3>
                <ul>
                  {p.crawlers.map((c) => (
                    <li key={c.name}>
                      <span className="catdot" style={{ background: cat(c.category).color }} aria-hidden="true" />
                      <span className="mono">{c.name}</span>
                      <span className="sr-only">, {cat(c.category).label}</span>
                      <span className="n">{fmtInt(c.requests)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
      <LazyTable<PageRow>
        noun="pages"
        nounOne="page"
        caption="Requested pages, by crawler"
        data={d.pages}
        initialSort={{ id: 'req', desc: true }}
        getSearchText={(x) => `${x.path} ${x.provider} ${x.crawler}`}
        emptyState={<EmptyState title={`No AI crawler requests ${inWindow(w)}`} body="Logs are arriving, but no known AI crawler asked for a page in this range." />}
        columns={[
          { id: 'path', header: 'Requested page', enableHiding: false, accessorFn: (x) => x.path, cell: (x) => <b className="mono font-medium">{x.path}</b> },
          { id: 'prov', header: 'Provider', accessorFn: (x) => x.provider },
          {
            id: 'cat',
            header: 'Purpose',
            accessorFn: (x) => x.category,
            meta: { hideSm: true },
            cell: (x) => (
              <span>
                <span className="catdot" style={{ background: cat(x.category).color }} aria-hidden="true" />
                {cat(x.category).label}
              </span>
            ),
          },
          { id: 'ua', header: 'Crawler', accessorFn: (x) => x.crawler, meta: { hideSm: true }, cell: (x) => <span className="mono">{x.crawler}</span> },
          { id: 'last', header: 'Last seen', accessorFn: (x) => x.lastSeen, meta: { align: 'r', hideSm: true }, cell: (x) => <span className="muted">{ago(x.lastSeen)}</span> },
          { id: 'req', header: 'Requests', accessorFn: (x) => x.requests, meta: { align: 'r' }, cell: (x) => fmtInt(x.requests) },
          {
            id: 'share',
            header: '% of total',
            accessorFn: (x) => x.share,
            meta: { align: 'r', hideSm: true, definition: 'This row’s requests of all AI crawler requests in the range. The bar is requests ÷ the largest row.' },
            cell: (x) => <BarCell value={x.requests} max={max}>{fmtPct(x.share)}</BarCell>,
          },
        ]}
      />
      <Method>
        By user agent; not verified by IP. A crawler that fakes its user agent is counted as the crawler it claims to be. {site ? `Website: ${site.domain}.` : ''}
      </Method>
    </div>
  )
}
