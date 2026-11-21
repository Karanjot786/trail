// The Overview screen (Task F2-5): What changed, the KPI strip, the chart with Recent journeys beside it
// (≥ 1200px) or under it, the six panels in pairs and the heatmap. The header, filter bar and freshness line
// belong to the shell. site=all renders All websites.
import { clearFilters } from '../../shell/FilterBar'
import { useShowRevenue, useSite } from '../../shell/useSite'
import { useStats } from '../../shell/useStats'
import { useUrlState } from '../../state/useUrlState'
import { Button } from '../../ui/button'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { AllSites } from './AllSites'
import { Heatmap } from './Heatmap'
import { KpiStrip } from './KpiStrip'
import { MainChart } from './MainChart'
import { visibleMetrics } from './metrics'
import { OverviewPanels } from './panels'
import { RecentJourneys } from './RecentJourneys'
import { WhatChanged } from './WhatChanged'
import './overview.css'

function OverviewSkeleton() {
  return (
    <div aria-busy="true" className="ov">
      <Skeleton height={112} />
      <Skeleton height={360} />
      <div className="grid2">
        <Skeleton height={320} />
        <Skeleton height={320} />
      </div>
    </div>
  )
}

export default function OverviewScreen() {
  const s = useUrlState()
  const { site } = useSite()
  const showRevenue = useShowRevenue()
  const stats = useStats()
  if (s.site === 'all') return <AllSites />
  if (stats.error && !stats.data) return <ErrorState onRetry={stats.refetch} />
  if (!stats.data) return <OverviewSkeleton />
  const st = stats.data
  const metrics = visibleMetrics(showRevenue)
  const metric = metrics.includes(s.metric) ? s.metric : 'visitors'
  const currency = site?.features.currency || 'USD'
  const compareOn = !st.window.basis.none
  const empty = st.visitors === 0 && st.pageviews === 0
  return (
    <div className="ov">
      <h2 className="sr-only">Key numbers, {st.window.label}</h2>
      <WhatChanged goalName={st.conv?.name} window={st.window} />
      <KpiStrip stats={st} metrics={metrics} active={metric} currency={currency} compareOn={compareOn} />
      {empty ? (
        <div className="panel ov-empty">
          {s.filters.length ? (
            <EmptyState
              title="No visits match these filters"
              body="Filters combine with AND, so each one narrows the last. Remove one, clear them all, or look at a longer range."
              action={
                <Button size="sm" onClick={clearFilters}>
                  Clear all filters
                </Button>
              }
            />
          ) : (
            <EmptyState title="No visits in this range yet" body="Real visits fill this page as they happen. Live shows them within 5 seconds." />
          )}
        </div>
      ) : (
        <>
          <div className="ov-top">
            <MainChart stats={st} metric={metric} metrics={metrics} currency={currency} />
            <RecentJourneys totalVisitors={st.visitors} />
          </div>
          <OverviewPanels ctx={{ goalName: st.conv?.name ?? null, currency }} />
          <Heatmap />
        </>
      )}
    </div>
  )
}
