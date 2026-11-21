// Acquisition → Sources: grouped by Source, Referrer URL or Channel. Bars follow value / max of this table.
import { useState } from 'react'
import { api } from '../../api/client'
import type { Dim, Row } from '../../api/types'
import { rowLabel } from '../../data/columns'
import { inWindow } from '../../lib/phrases'
import { Segmented } from '../../ui/tabs'
import { EmptyState } from '../../ui/states'
import LazyTable from '../activity/LazyTable'
import { Lede, maxOf, useReport } from '../conversions/kit'
import { metricColumns, openRow, toggleFilter, type MetricCtx } from './columns'

type Group = 'source' | 'referrer' | 'channel'
const GROUPS: { value: Group; label: string }[] = [
  { value: 'source', label: 'Source' },
  { value: 'referrer', label: 'Referrer URL' },
  { value: 'channel', label: 'Channel' },
]
const LEDE: Record<Group, string> = {
  source: 'The referring site or UTM source of each visit, cleaned up: google.com, www.google.com and the Google app are one row. Select a row for its report. Goal rates and revenue are first touch, the same as the Revenue screen.',
  referrer: 'The exact referring URL, as the browser sent it. Many sites only send their origin, so a bare domain is normal.',
  channel: 'Sources grouped by kind. Direct means no referrer and no UTM tags.',
}

export function Sources({ ctx, share }: { ctx: Omit<MetricCtx, 'max'>; share: boolean }) {
  const [group, setGroup] = useState<Group>('source')
  const r = useReport(`breakdown:${group}`, (q, sig) => api.breakdown(q, group as Dim, { limit: 1000 }, sig))
  const rows = (r.data?.rows ?? []).filter((x) => x.visitors > 0)
  const cols = metricColumns<Row & { views?: number }>({ ...ctx, max: maxOf(rows, (x) => x.visitors) })
  const head = group === 'referrer' ? 'Referrer' : group === 'channel' ? 'Channel' : 'Source'
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={group} onValueChange={(v) => setGroup(v as Group)} items={GROUPS} ariaLabel="Group by" />
      </div>
      <Lede>{LEDE[group]}</Lede>
      <LazyTable<Row>
        key={group}
        noun={group === 'channel' ? 'channels' : 'sources'}
        nounOne={group === 'channel' ? 'channel' : 'source'}
        caption={`${head}s, with goal rates and revenue by first touch`}
        data={rows.map((x) => ({ ...x, views: x.views ?? x.pageviews }))}
        total={r.data?.total}
        loading={r.loading && !r.data}
        error={r.data ? null : r.error}
        onRetry={r.refetch}
        initialSort={{ id: 'visitors', desc: true }}
        getSearchText={(x) => rowLabel(group, x.key)}
        onRowOpen={(x) => openRow(group, x.key)}
        onRowFilter={share ? undefined : (x) => toggleFilter(r.s.filters, group, x.key)}
        getRowFilterLabel={(x) => `${group} ${rowLabel(group, x.key)}`}
        isRowFiltered={(x) => r.s.filters.some((f) => f.dim === group && f.value === x.key)}
        exportHref={share ? undefined : api.exportUrl('/breakdown', withDim(r.q, group), 'csv')}
        emptyState={<EmptyState title={`No visits ${inWindow({ key: r.s.range })}`} body="Visits show up here as soon as the tracker sends them." />}
        columns={[
          {
            id: 'name',
            header: head,
            enableHiding: false,
            accessorFn: (x) => rowLabel(group, x.key),
            cell: (x) => (
              <span className="cellname">
                <b className={group === 'referrer' ? 'mono' : undefined}>{rowLabel(group, x.key)}</b>
              </span>
            ),
          },
          ...cols,
        ]}
      />
    </>
  )
}

export function withDim(q: URLSearchParams, dim: string) {
  const p = new URLSearchParams(q)
  p.set('dim', dim)
  return p
}
