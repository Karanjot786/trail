// The Overview panels, paired Pages|Sources, Location|Events, Devices|Goals (Task F2-5).
// Plan F-6: the Location panel labels its accuracy. Countries are facts; regions are approximate; cities are a
// rough estimate, often the ISP's hub city. A chip under the panel names where locations come from.
import { api } from '../../api/client'
import type { Config, SiteStatus } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import { Panel, type PanelTab } from '../../data/Panel'
import { PANEL_TITLES, panelTabs, type ColumnCtx } from '../../data/columns'
import { useDataMode } from '../../shell/useDataMode'
import { useUrlState } from '../../state/useUrlState'
import { InfoHint } from '../../ui/tooltip'

export const PANEL_PAIRS: [string, string][] = [
  ['pages', 'sources'],
  ['location', 'events'],
  ['devices', 'goals'],
]

export const CITY_HINT =
  'Often the city of your visitor’s network hub, not where they are. Mobile networks route through a few hub cities; independent GPS checks put only 20–37% of Indian visitors within 25 km of the city shown, whatever the database.'

/** The Location tabs with their accuracy in the label. */
export function locationTabs(tabs: PanelTab[]): PanelTab[] {
  return tabs.map((t) =>
    t.value === 'regions'
      ? { ...t, label: 'Regions · approximate' }
      : t.value === 'cities'
        ? { ...t, label: 'Cities · rough estimate', definition: 'Rough estimate, often the ISP’s hub city rather than where the visitor is.' }
        : t,
  )
}

type GeoSource = NonNullable<SiteStatus['geo']>['source']
/** "Location: your edge (Vercel)" … or, for the database, which database answers. */
export function geoSourceLabel(source: GeoSource | null | undefined, db: Config['geo']['source'] | null | undefined): string | null {
  if (source === 'vercel') return 'Location: your edge (Vercel)'
  if (source === 'cloudflare') return 'Location: Cloudflare'
  if (source === 'netlify') return 'Location: Netlify'
  if (db === 'embedded-country') return 'Location: DB-IP Lite (country)'
  if (db === 'custom' || source === 'db') return 'Location: your database'
  return null
}

export function GeoSourceChip() {
  const s = useUrlState()
  const { mode } = useDataMode()
  const site = s.site && s.site !== 'all' ? s.site : ''
  const st = useQuery(`site-status|${site}|${s.prefix}`, async (sig) => api.siteStatus(site, sig), { enabled: !!site && !s.prefix.startsWith('/share/'), staleMs: 60_000 })
  const cfg = useQuery('config', async (sig) => api.config(sig), { enabled: mode === 'http' && !s.prefix, staleMs: 60_000 })
  const source = st.data?.geo?.source
  const label = geoSourceLabel(source, cfg.data?.geo.source)
  const dbip = (!source || source === 'db') && cfg.data?.geo.source === 'embedded-country'
  return (
    <p className="geo-src m-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-caption text-muted" data-testid="geo-source">
      {label && <span className="chip">{label}</span>}
      <span className="inline-flex items-center gap-1">
        Cities are a rough estimate, often the ISP’s hub city
        <InfoHint label="Cities · rough estimate">{CITY_HINT}</InfoHint>
      </span>
      {dbip && (
        <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="text-muted underline underline-offset-[3px]">
          IP geolocation by DB-IP
        </a>
      )}
    </p>
  )
}

export function OverviewPanels({ ctx }: { ctx: ColumnCtx }) {
  return (
    <div className="grid2">
      {PANEL_PAIRS.flat().map((id) =>
        id === 'location' ? (
          <div key={id} className="flex min-w-0 flex-col gap-2 [&>section]:flex-1">
            <Panel id={id} title={PANEL_TITLES[id]} tabs={locationTabs(panelTabs(id, ctx))} />
            <GeoSourceChip />
          </div>
        ) : (
          <Panel key={id} id={id} title={PANEL_TITLES[id]} tabs={panelTabs(id, ctx)} />
        ),
      )}
    </div>
  )
}
