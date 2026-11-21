// Conversions (Tasks F4-2, F4-3): Goals (cards, goal detail) and Funnels (picker, steps, drop-off sheet).
import { DollarSign } from 'lucide-react'
import { api } from '../../api/client'
import { useQuery } from '../../api/useQuery'
import { RouteLink } from '../../shell/RouteLink'
import { useShowRevenue, useSite } from '../../shell/useSite'
import { useUrlState } from '../../state/useUrlState'
import { EmptyState } from '../../ui/states'
import { Funnels, useFunnels } from './Funnels'
import { GoalDetail } from './GoalDetail'
import { Goals } from './Goals'
import { PageTabs } from './kit'

export default function ConversionsScreen() {
  const s = useUrlState()
  const { share: shareMeta } = useSite()
  const revenue = useShowRevenue()
  const share = s.prefix.startsWith('/share/')
  const goals = useQuery(`f4|goals|${s.site}|${s.prefix}`, (sig) => api.goals(s.site, sig), { enabled: !!s.site && s.site !== 'all' })
  const funnels = useFunnels()
  const tab = s.tab === 'funnels' ? 'funnels' : 'goals'

  if (s.site === 'all') return <EmptyState title="Pick a website" body="Goals and funnels belong to one website. Choose one in the switcher at the top left." />

  return (
    <div className="f4">
      <PageTabs
        label="Conversion views"
        value={tab}
        items={[
          { value: 'goals', label: 'Goals', count: goals.data?.length, patch: { screen: 'conversions', tab: 'goals', id: null, sheet: null } },
          { value: 'funnels', label: 'Funnels', count: funnels.data?.length, patch: { screen: 'conversions', tab: 'funnels', id: null, sheet: null } },
        ]}
      />
      {tab === 'goals' ? s.id != null ? <GoalDetail key={s.id} id={s.id} share={share} /> : <Goals share={share} /> : <Funnels id={s.id} share={share} />}
      {!revenue && !share && !shareMeta && (
        <p className="method flex items-center gap-2">
          <DollarSign size={14} aria-hidden="true" />
          <span>
            Revenue has its own screen, and it appears in the sidebar by itself once this site sends a <code className="inl">Purchase</code> event.{' '}
            <RouteLink patch={{ screen: 'revenue', tab: '', id: null, sheet: null }}>Why it is hidden</RouteLink>
          </span>
        </p>
      )}
    </div>
  )
}

