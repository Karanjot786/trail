import { ZapIcon } from 'lucide-react'
import { api, isDemo } from './api'
import { queryKey, useDashboard } from './state'
import { useFetch } from './useFetch'
import { KpiTabs } from './components/KpiTabs'
import { MainChart } from './components/MainChart'
import { Panel } from './components/Panel'
import { EmptyState } from './components/EmptyState'
import { GoalsPanel } from './components/GoalsPanel'

export function Dashboard() {
  const d = useDashboard()
  const stats = useFetch(queryKey(d.query, 'stats'), (s) => api.stats(d.query, s))
  const series = useFetch(queryKey(d.query, 'series', d.metric), (s) => api.series(d.query, d.metric, s))
  const total = stats.data?.visitors ?? 0

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-xl border border-border bg-black" aria-label="Overview">
        <KpiTabs stats={stats.data} metric={d.metric} onChange={(metric) => d.set({ metric })} />
        <MainChart
          series={series.data}
          metric={d.metric}
          onBucket={(from, to) => d.set({ range: 'custom', from, to, view: 'visitors', person: '' }, { push: true })}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          total={total}
          tabs={[
            { label: 'Pages', dim: 'path', column: 'visitors' },
            { label: 'Routes', dim: 'route', column: 'visitors' },
            { label: 'Hostnames', dim: 'host', column: 'visitors' },
          ]}
        />
        <Panel
          total={total}
          tabs={[
            { label: 'Referrers', dim: 'referrer', column: 'visitors' },
            { label: 'UTM Parameters', dim: 'utm_source', column: 'visitors' },
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Panel total={total} tabs={[{ label: 'Countries', dim: 'country', column: 'pct' }]} />
        <Panel
          total={total}
          tabs={[
            { label: 'Devices', dim: 'device', column: 'pct' },
            { label: 'Browsers', dim: 'browser', column: 'pct' },
          ]}
        />
        <Panel total={total} className="md:col-span-2 lg:col-span-1" tabs={[{ label: 'Operating Systems', dim: 'os', column: 'pct' }]} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          total={total}
          tabs={[{ label: 'Events', dim: 'event', column: 'visitors+total' }]}
          empty={
            <EmptyState icon={ZapIcon} title="No custom events">
              Call <code className="rounded bg-raised px-1 py-0.5 font-mono text-[13px] text-fg">trail.track('Signup')</code> from
              your app to see custom events here.
            </EmptyState>
          }
        />
        <GoalsPanel readOnly={isDemo} />
      </div>
    </div>
  )
}
