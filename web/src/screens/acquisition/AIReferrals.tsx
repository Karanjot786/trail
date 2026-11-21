// Acquisition → AI referrals: assistants that sent a referrer. A floor, not a total.
import { MessageSquare } from 'lucide-react'
import { api, type List } from '../../api/client'
import type { AIReferral } from '../../api/types'
import type { QueryResult } from '../../api/useQuery'
import { inWindow } from '../../lib/phrases'
import { EmptyState } from '../../ui/states'
import LazyTable from '../activity/LazyTable'
import { Lede, maxOf } from '../conversions/kit'
import { metricColumns, openRow, toggleFilter, type MetricCtx } from './columns'
import type { UrlState } from '../../state/url'

export function AIReferrals({ r, ctx, share, s, q }: { r: QueryResult<List<AIReferral>>; ctx: Omit<MetricCtx, 'max'>; share: boolean; s: UrlState; q: URLSearchParams }) {
  const rows = r.data?.rows ?? []
  return (
    <>
      <Lede>
        People arriving from an AI assistant that sent a referrer. Assistants that open links without one are counted as Direct, so treat this as a floor, not a total.
      </Lede>
      <LazyTable<AIReferral>
        noun="assistants"
        nounOne="assistant"
        caption="AI referrals, with goal rates and revenue by first touch"
        data={rows}
        total={r.data?.total}
        loading={r.loading && !r.data}
        error={r.data ? null : r.error}
        onRetry={r.refetch}
        initialSort={{ id: 'visitors', desc: true }}
        getSearchText={(x) => x.key}
        onRowOpen={(x) => openRow('ai_source', x.key)}
        onRowFilter={share ? undefined : (x) => toggleFilter(s.filters, 'ai_source', x.key)}
        getRowFilterLabel={(x) => `assistant ${x.key}`}
        isRowFiltered={(x) => s.filters.some((f) => f.dim === 'ai_source' && f.value === x.key)}
        exportHref={share ? undefined : api.exportUrl('/ai-referrals', q, 'csv')}
        emptyState={
          <EmptyState
            title={`No AI referrals ${inWindow({ key: s.range })}`}
            body="When ChatGPT, Perplexity, Claude, Gemini or Copilot link to you and pass a referrer, the visit lands here."
          />
        }
        columns={[
          {
            id: 'name',
            header: 'Assistant',
            enableHiding: false,
            accessorFn: (x) => x.key,
            cell: (x) => (
              <span className="cellname">
                <MessageSquare size={14} aria-hidden="true" className="text-subtle" />
                <b>{x.key}</b>
              </span>
            ),
          },
          {
            id: 'land',
            header: 'Lands on',
            enableSorting: false,
            accessorFn: (x) => x.topEntry,
            meta: { hideSm: true, definition: 'The landing page this assistant sends the most people to.' },
            cell: (x) => (x.topEntry ? <span className="mono">{x.topEntry}</span> : <span className="subtle">n/a</span>),
          },
          ...metricColumns<AIReferral>({ ...ctx, max: maxOf(rows, (x) => x.visitors) }, { views: false, share: false }).filter((c) => c.id !== 'bounce'),
        ]}
      />
    </>
  )
}
