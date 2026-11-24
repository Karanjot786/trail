// The full report (rep=panel:tab, Task F2-5): every row and every column of a panel in a DataTable, the
// panel's tabs, a CSV download and the same query printed as an API call.
import { api } from '../api/client'
import { useQuery } from '../api/useQuery'
import type { TableColumn } from '../data/DataTable'
import { cellText, MONO_DIMS, PANEL_TITLES, panelTabs, rowLabel, toRows } from '../data/columns'
import { curlFor } from '../data/Panel'
import LazyTable from '../screens/activity/LazyTable'
import { useSite } from '../shell/useSite'
import { useStats } from '../shell/useStats'
import { apiQuery } from '../state/url'
import { navigate, useUrlState } from '../state/useUrlState'
import { CodeBlock } from '../ui/code'
import { Sheet } from '../ui/dialog'
import { EmptyState } from '../ui/states'
import { Tabs } from '../ui/tabs'
import type { BarRowModel } from '../data/BarList'
import '../data/data.css'

export function FullReportSheet() {
  const s = useUrlState()
  const sheet = s.sheet?.kind === 'report' ? s.sheet : null
  return (
    <Sheet open={!!sheet} onOpenChange={(o) => !o && navigate({ sheet: null })} title={sheet ? (PANEL_TITLES[sheet.panel] ?? 'Report') : 'Report'} size="wide">
      {sheet && <FullReport panel={sheet.panel} tab={sheet.tab} />}
    </Sheet>
  )
}

function FullReport({ panel, tab: tabId }: { panel: string; tab: string }) {
  const s = useUrlState()
  const { site } = useSite()
  const stats = useStats()
  const ctx = { goalName: stats.data?.conv?.name ?? null, currency: site?.features.currency || 'USD' }
  const tabs = panelTabs(panel, ctx)
  const tab = tabs.find((t) => t.value === tabId) ?? tabs[0]
  const isShare = s.prefix.startsWith('/share/')
  const q = apiQuery(s)
  const r = useQuery(`breakdown-all|${tab?.dim}|${q}|${s.prefix}`, async (sig) => api.breakdown(q, tab.dim, { limit: 1000 }, sig), { enabled: !!tab })
  if (!tab) return null
  const rows = toRows(r.data?.rows ?? [], tab.dim, tab.columns[0], stats.data?.visitors ?? null)
  const columns: TableColumn<BarRowModel>[] = [
    {
      id: 'name',
      header: tab.label,
      enableHiding: false,
      accessorFn: (row) => row.label,
      cell: (row) => <span className={MONO_DIMS.has(row.dim) ? 'mono' : undefined}>{rowLabel(row.dim, row.key)}</span>,
    },
    ...tab.columns.map(
      (c): TableColumn<BarRowModel> => ({
        id: c.id,
        header: c.header,
        meta: { align: 'r', definition: c.definition },
        accessorFn: (row) => c.value(row),
        cell: (row) => cellText(c, row),
      }),
    ),
  ]
  const xq = new URLSearchParams(q)
  xq.set('dim', tab.dim)
  return (
    <div className="rep">
      {tabs.length > 1 && (
        <Tabs
          ariaLabel="Report"
          value={tab.value}
          onValueChange={(v) => navigate({ sheet: { kind: 'report', panel, tab: v } }, { replace: true })}
          items={tabs.map((t) => ({ value: t.value, label: t.label }))}
        />
      )}
      <LazyTable<BarRowModel>
        columns={columns}
        data={rows}
        total={r.data?.total}
        loading={r.loading && !r.data}
        error={r.error}
        onRetry={r.refetch}
        getSearchText={(row) => row.label}
        initialSort={{ id: tab.columns[0]?.id ?? 'name', desc: true }}
        exportHref={isShare ? undefined : api.exportUrl('/breakdown', xq, 'csv')}
        onRowOpen={(row) => navigate({ sheet: { kind: 'row', dim: row.dim, key: row.key } })}
        noun={tab.label.toLowerCase()}
        caption={tab.label}
        emptyState={<EmptyState title="Nothing in this range" body="Try a longer range or remove a filter." />}
      />
      {!isShare && (
        <section className="rep-api" aria-labelledby="rep-api-h">
          <h3 id="rep-api-h">Same query over the API</h3>
          <CodeBlock code={curlFor(q, tab.dim, location.origin)} lang="bash" />
        </section>
      )}
    </div>
  )
}

