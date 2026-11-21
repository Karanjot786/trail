// The Overview panels, paired Pages|Sources, Location|Events, Devices|Goals (Task F2-5).
import { Panel } from '../../data/Panel'
import { PANEL_TITLES, panelTabs, type ColumnCtx } from '../../data/columns'

export const PANEL_PAIRS: [string, string][] = [
  ['pages', 'sources'],
  ['location', 'events'],
  ['devices', 'goals'],
]

export function OverviewPanels({ ctx }: { ctx: ColumnCtx }) {
  return (
    <div className="grid2">
      {PANEL_PAIRS.flat().map((id) => (
        <Panel key={id} id={id} title={PANEL_TITLES[id]} tabs={panelTabs(id, ctx)} />
      ))}
    </div>
  )
}
