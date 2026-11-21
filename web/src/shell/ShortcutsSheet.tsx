// The shortcut sheet (plan F1-6): two columns, opened instantly by `?`.
import { SCREENS } from '../routes'
import { Dialog } from '../ui/dialog'
import { Kbd } from '../ui/small'
import { MOD, NAV_KEY } from './Sidebar'
import { setUi, useUi } from './uiStore'

function Row({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="sc-row">
      <span>{label}</span>
      <Kbd>{keys}</Kbd>
    </div>
  )
}

export function ShortcutsSheet() {
  const ui = useUi()
  const open = ui.shortcuts != null
  return (
    <Dialog open={open} onOpenChange={(o) => setUi({ shortcuts: o ? (ui.shortcuts ?? { instant: false }) : null })} title="Keyboard shortcuts" size="wide" instant={ui.shortcuts?.instant}>
      <div className="sc-cols">
        <div>
          <div className="sc-h">Anywhere</div>
          <Row label="Search, jump and filter" keys={`${MOD} K`} />
          <Row label="Add a filter" keys="F" />
          <Row label="Clear all filters" keys="Shift X" />
          <Row label="Undo the last filter (browser Back)" keys="Back" />
          <Row label="Save the view to the sidebar" keys="S" />
          <Row label="Collapse sidebar" keys="[" />
          <Row label="Switch theme" keys="T" />
          <Row label="This sheet" keys="?" />
          <div className="sc-h">Overview chart</div>
          <Row label="Chart metric" keys="1 7" />
          <Row label="Step through days" keys="← →" />
          <Row label="Zoom into the day" keys="↵" />
        </div>
        <div>
          <div className="sc-h">Go to</div>
          {SCREENS.map((r) => (
            <Row key={r.id} label={r.label} keys={`G ${NAV_KEY[r.id]}`} />
          ))}
          <div className="sc-h">Journey</div>
          <Row label="Previous or next visit" keys="[ ]" />
          <Row label="Close the top layer (never clears filters)" keys="Esc" />
        </div>
      </div>
    </Dialog>
  )
}
