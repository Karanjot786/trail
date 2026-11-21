// Acquisition (Task F4-1): Sources, AI referrals, Campaigns and Landing pages. Every table is a DataTable,
// bars follow value / max of the table, and goal rates and revenue are first touch (the header says so).
import { api } from '../../api/client'
import { rowLabel } from '../../data/columns'
import { fmtInt, fmtPct } from '../../lib/format'
import { useShowRevenue, useSite } from '../../shell/useSite'
import { useStats } from '../../shell/useStats'
import { EmptyState } from '../../ui/states'
import { PageTabs, Stat, StatStrip, plural, useReport } from '../conversions/kit'
import { RouteLink } from '../../shell/RouteLink'
import { AIReferrals } from './AIReferrals'
import { Campaigns } from './Campaigns'
import { Landing } from './Landing'
import { Sources } from './Sources'
import { toggleFilter, type MetricCtx } from './columns'

const TABS = [
  { value: 'sources', label: 'Sources' },
  { value: 'ai', label: 'AI referrals' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'landing', label: 'Landing pages' },
]

export default function AcquisitionScreen() {
  const { site } = useSite()
  const revenue = useShowRevenue()
  const stats = useStats()
  const src = useReport('breakdown:source', (q, sig) => api.breakdown(q, 'source', { limit: 1000 }, sig))
  const ai = useReport('ai-referrals', (q, sig) => api.aiReferrals(q, { limit: 1000 }, sig))
  const camps = useReport('campaigns', (q, sig) => api.campaigns(q, { limit: 1000 }, sig))
  const s = src.s
  const share = s.prefix.startsWith('/share/')
  const tab = TABS.some((t) => t.value === s.tab) ? s.tab : 'sources'

  if (s.site === 'all') {
    return <EmptyState title="Pick a website" body="Acquisition reports one website at a time. Choose one in the switcher at the top left." />
  }

  const total = stats.data?.visitors ?? null
  const ctx: Omit<MetricCtx, 'max'> = { total, goalName: stats.data?.conv?.name ?? null, revenue, currency: site?.features?.currency || 'USD' }
  const srcRows = (src.data?.rows ?? []).filter((r) => r.visitors > 0).sort((a, b) => b.visitors - a.visitors)
  const direct = srcRows.find((r) => r.key === '' || r.key === 'Direct')
  const aiRows = ai.data?.rows ?? []
  const aiVis = aiRows.reduce((a, r) => a + r.visitors, 0)
  const campRows = camps.data?.rows ?? []
  const top = srcRows[0]
  const counts: Record<string, number | undefined> = { sources: src.data ? srcRows.length : undefined, ai: ai.data ? aiRows.length : undefined, campaigns: camps.data ? campRows.length : undefined }

  return (
    <div className="f4">
      <PageTabs
        label="Acquisition views"
        value={tab}
        items={TABS.map((t) => ({ ...t, count: counts[t.value], patch: { screen: 'acquisition', tab: t.value, id: null, sheet: null } }))}
      />
      <StatStrip>
        <Stat k="Referred visitors" v={total ? fmtPct((total - (direct?.visitors ?? 0)) / total) : '0%'} s="came with a referrer or UTM tag" />
        <RouteLink patch={{ screen: 'acquisition', tab: 'ai', sheet: null }}>
          <span className="k">From AI assistants</span>
          <span className="v">{fmtInt(aiVis)}</span>
          <span className="s">
            {total ? fmtPct(aiVis / total) : '0%'} of visitors · {plural(aiRows.length, 'assistant')}
          </span>
        </RouteLink>
        {top && !share ? (
          <button type="button" onClick={() => toggleFilter(s.filters, 'source', top.key)}>
            <span className="k">Top source</span>
            <span className="v word">{rowLabel('source', top.key)}</span>
            <span className="s">
              {fmtInt(top.visitors)} visitors{total ? ` · ${fmtPct(top.visitors / total)} of total` : ''} · filter by it
            </span>
          </button>
        ) : (
          <Stat k="Top source" v={top ? rowLabel('source', top.key) : 'none yet'} s={top ? `${fmtInt(top.visitors)} visitors` : 'no visits in this range'} />
        )}
        <RouteLink patch={{ screen: 'acquisition', tab: 'campaigns', sheet: null }}>
          <span className="k">Tagged campaigns</span>
          <span className="v">{fmtInt(campRows.length)}</span>
          <span className="s">{fmtInt(campRows.reduce((a, r) => a + r.visitors, 0))} visitors with UTM tags</span>
        </RouteLink>
      </StatStrip>
      {tab === 'sources' && <Sources ctx={ctx} share={share} />}
      {tab === 'ai' && <AIReferrals r={ai} ctx={ctx} share={share} s={s} q={ai.q} />}
      {tab === 'campaigns' && <Campaigns r={camps} ctx={ctx} share={share} s={s} q={camps.q} />}
      {tab === 'landing' && <Landing ctx={ctx} share={share} />}
    </div>
  )
}
