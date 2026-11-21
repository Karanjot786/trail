// Acquisition → Landing pages: the first page of each visit, with how well it does and its top source.
import { api } from '../../api/client'
import type { Row } from '../../api/types'
import { rowLabel } from '../../data/columns'
import { inWindow } from '../../lib/phrases'
import { EmptyState } from '../../ui/states'
import LazyTable from '../activity/LazyTable'
import { Lede, maxOf, useReport } from '../conversions/kit'
import { metricColumns, openRow, toggleFilter, type MetricCtx } from './columns'
import { withDim } from './Sources'

export function Landing({ ctx, share }: { ctx: Omit<MetricCtx, 'max'>; share: boolean }) {
  const r = useReport('breakdown:entry', (q, sig) => api.breakdown(q, 'entry', { limit: 1000 }, sig))
  const rows = (r.data?.rows ?? []).filter((x) => x.visitors > 0)
  return (
    <>
      <Lede>The first page of each visit, with how well it does: bounce rate, goal rate and the source that sends it the most people.</Lede>
      <LazyTable<Row>
        noun="landing pages"
        nounOne="landing page"
        caption="Landing pages, with goal rates and revenue by first touch"
        data={rows.map((x) => ({ ...x, views: x.views ?? x.pageviews }))}
        total={r.data?.total}
        loading={r.loading && !r.data}
        error={r.data ? null : r.error}
        onRetry={r.refetch}
        initialSort={{ id: 'visitors', desc: true }}
        getSearchText={(x) => x.key}
        onRowOpen={(x) => openRow('entry', x.key)}
        onRowFilter={share ? undefined : (x) => toggleFilter(r.s.filters, 'entry', x.key)}
        getRowFilterLabel={(x) => `entry page ${x.key}`}
        isRowFiltered={(x) => r.s.filters.some((f) => f.dim === 'entry' && f.value === x.key)}
        exportHref={share ? undefined : api.exportUrl('/breakdown', withDim(r.q, 'entry'), 'csv')}
        emptyState={<EmptyState title={`No visits ${inWindow({ key: r.s.range })}`} body="Landing pages show up here as soon as the tracker sends a page view." />}
        columns={[
          {
            id: 'name',
            header: 'Landing page',
            enableHiding: false,
            accessorFn: (x) => x.key,
            cell: (x) => <b className="mono font-medium">{x.key}</b>,
          },
          {
            id: 'top',
            header: 'Top source',
            enableSorting: false,
            accessorFn: (x) => x.top ?? '',
            meta: { hideSm: true, definition: 'The source that sends this page the most visitors.' },
            cell: (x) => (x.top != null ? rowLabel('source', x.top) : <span className="subtle">n/a</span>),
          },
          ...metricColumns<Row>({ ...ctx, max: maxOf(rows, (x) => x.visitors) }),
        ]}
      />
    </>
  )
}
