// Activity (plan Tasks F3-3 to F3-5): Visitors · Sessions · Events · Paths. The tab is the URL path.
import { lazy, Suspense } from 'react'
import { SCREEN_TABS } from '../../state/url'
import { navigate, useUrlState } from '../../state/useUrlState'
import { Skeleton } from '../../ui/states'
import { Tabs } from '../../ui/tabs'
import './activity.css'

const TABS = [
  { value: 'visitors', label: 'Visitors' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'events', label: 'Events' },
  { value: 'paths', label: 'Paths' },
] as const

const PANES = {
  visitors: lazy(() => import('./Visitors')),
  sessions: lazy(() => import('./Sessions')),
  events: lazy(() => import('./Events')),
  paths: lazy(() => import('./Paths')),
}

export default function ActivityScreen() {
  const s = useUrlState()
  const tab = (SCREEN_TABS.activity.includes(s.tab) ? s.tab : 'visitors') as keyof typeof PANES
  const Pane = PANES[tab]
  return (
    <div className="activity">
      <div className="act-tabs">
        <Tabs ariaLabel="Activity views" idBase="act" value={tab} items={[...TABS]} onValueChange={(v) => navigate({ tab: v, sheet: null })} />
      </div>
      <div role="tabpanel" id={`act-${tab}-panel`} aria-labelledby={`act-${tab}`}>
        <Suspense fallback={<Skeleton height={320} />}>
          <Pane />
        </Suspense>
      </div>
    </div>
  )
}
