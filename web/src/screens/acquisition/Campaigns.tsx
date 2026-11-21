// Acquisition → Campaigns: UTM-tagged visits, parsed into chips. Source and medium chips filter.
import { Hash } from 'lucide-react'
import { api, type List } from '../../api/client'
import type { Campaign, Dim } from '../../api/types'
import type { QueryResult } from '../../api/useQuery'
import { inWindow } from '../../lib/phrases'
import type { UrlState } from '../../state/url'
import { EmptyState } from '../../ui/states'
import LazyTable from '../activity/LazyTable'
import { Lede, maxOf } from '../conversions/kit'
import { metricColumns, openRow, toggleFilter, type MetricCtx } from './columns'

const TAGS = ['campaign', 'source', 'medium', 'term', 'content'] as const

export function Campaigns({ r, ctx, share, s, q }: { r: QueryResult<List<Campaign>>; ctx: Omit<MetricCtx, 'max'>; share: boolean; s: UrlState; q: URLSearchParams }) {
  const rows = r.data?.rows ?? []
  const chips = (c: Campaign) => (
    <span className="utm">
      {TAGS.filter((k) => c[k]).map((k) => {
        const dim = `utm_${k}` as Dim
        const label = (
          <>
            <span className="k">{k}</span>
            <span className="v mono">{c[k]}</span>
          </>
        )
        return share ? (
          <span key={k} className="chip" data-utm={k}>
            {label}
          </span>
        ) : (
          <button
            key={k}
            type="button"
            className="chip chip-btn"
            data-utm={k}
            aria-label={`Filter by UTM ${k} ${c[k]}`}
            onClick={(e) => {
              e.stopPropagation()
              toggleFilter(s.filters, dim, c[k])
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {label}
          </button>
        )
      })}
    </span>
  )
  const key = (c: Campaign) => [c.campaign, c.source, c.medium, c.term, c.content].join('\u0000')
  return (
    <>
      <Lede>Visits that arrived with UTM tags, parsed into their parts instead of a raw URL. Select a tag to filter by just that part.</Lede>
      <LazyTable<Campaign>
        noun="campaigns"
        nounOne="campaign"
        caption="Campaigns, with goal rates and revenue by first touch"
        data={rows}
        total={r.data?.total}
        loading={r.loading && !r.data}
        error={r.data ? null : r.error}
        onRetry={r.refetch}
        initialSort={{ id: 'visitors', desc: true }}
        getSearchText={(c) => TAGS.map((k) => c[k]).join(' ')}
        onRowOpen={(c) => openRow('utm_campaign', c.campaign)}
        exportHref={share ? undefined : api.exportUrl('/campaigns', q, 'csv')}
        emptyState={
          <EmptyState
            title={`No tagged visits ${inWindow({ key: s.range })}`}
            body="Add ?utm_source=x&utm_medium=social&utm_campaign=launch to links you share and they show up here, parsed."
          />
        }
        columns={[
          {
            id: 'name',
            header: 'Campaign',
            enableHiding: false,
            accessorFn: (c) => c.campaign,
            cell: (c) => (
              <span className="cellname" data-key={key(c)}>
                <Hash size={14} aria-hidden="true" className="text-subtle" />
                <b className="mono">{c.campaign || '(no campaign)'}</b>
              </span>
            ),
          },
          { id: 'utm', header: 'UTM tags', enableSorting: false, accessorFn: (c) => TAGS.map((k) => c[k]).join(' '), cell: chips },
          ...metricColumns<Campaign>({ ...ctx, max: maxOf(rows, (x) => x.visitors) }, { views: false, share: false }),
        ]}
      />
    </>
  )
}
