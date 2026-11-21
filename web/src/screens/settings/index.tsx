// Settings (plan F5): a section rail beside one section. The section is the URL tab (/settings/{tab}).
import { SCREEN_TABS } from '../../state/url'
import { useUrlState } from '../../state/useUrlState'
import { SettingsRail } from './parts'
import Sites from './Sites'
import Install from './Install'
import Assistants from './Assistants'
import Tokens from './Tokens'
import Sharing from './Sharing'
import Data from './Data'
import Config from './Config'

const BODY: Record<string, () => React.JSX.Element> = { sites: Sites, install: Install, assistants: Assistants, tokens: Tokens, sharing: Sharing, data: Data, config: Config }

export default function SettingsScreen() {
  const s = useUrlState()
  const tab = SCREEN_TABS.settings.includes(s.tab) ? s.tab : 'sites'
  const Body = BODY[tab]
  return (
    <div className="settings">
      <SettingsRail tab={tab} />
      <div>
        <Body />
      </div>
    </div>
  )
}
