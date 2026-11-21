// AI visibility (plan F-1): one home for everything AI, at /ai with tabs Funnel (default), Crawlers and Agents.
// The URL holds the tab, so Back undoes a switch (each switch is a navigation, not a replace). The setup status is read once here and shared by the tabs.
import { useSite } from '../../shell/useSite'
import { EmptyState } from '../../ui/states'
import { Tabs } from '../../ui/tabs'
import { AgentsTab } from './Agents'
import { CrawlersTab } from './Crawlers'
import { FunnelTab } from './Funnel'
import { useAISetup } from './UnlockCard'
import { navigate, useUrlState } from '../../state/useUrlState'
import './ai.css'

export const AI_TABS = [
  { value: 'funnel', label: 'Funnel' },
  { value: 'crawlers', label: 'Crawlers' },
  { value: 'agents', label: 'Agents' },
] as const

export default function AIScreen() {
  const s = useUrlState()
  const { site } = useSite()
  const setup = useAISetup(s.site)
  const tab = AI_TABS.some((t) => t.value === s.tab) ? s.tab : 'funnel'
  const domain = site?.domain ?? s.site

  return (
    <div className="f4">
      <div className="page-tabs tabs-lg">
        <Tabs value={tab} onValueChange={(v) => navigate({ screen: 'crawlers', tab: v, id: null, sheet: null })} items={[...AI_TABS]} ariaLabel="AI visibility views" idBase="ai" />
      </div>
      <div className="f4" role="tabpanel" id={`ai-${tab}-panel`} aria-labelledby={`ai-${tab}`}>
      {s.site === 'all' ? (
        <EmptyState title="Pick a website" body="AI visibility belongs to one website. Choose one in the switcher at the top left." />
      ) : tab === 'crawlers' ? (
        <CrawlersTab domain={domain} setup={setup.data} />
      ) : tab === 'agents' ? (
        <AgentsTab domain={domain} setup={setup.data} />
      ) : (
        <FunnelTab domain={domain} setup={setup.data} />
      )}
      </div>
    </div>
  )
}
