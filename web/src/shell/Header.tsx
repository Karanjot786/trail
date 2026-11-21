// The header (plan F1-5): title, live pill, RangePicker, CompareMenu and Share; the filter bar is sticky with it.
import { Link2, Menu as MenuIcon, PanelLeft } from 'lucide-react'
import { SCREENS } from '../routes'
import { useUrlState } from '../state/useUrlState'
import { StatusDot } from '../ui/small'
import { RangePicker } from './RangePicker'
import { CompareMenu } from './CompareMenu'
import { FilterBar } from './FilterBar'
import { RouteLink } from './RouteLink'
import { useStats } from './useStats'
import { useOnline } from './useOnline'
import { setUi, useUi } from './uiStore'

export function toggleRail(pointer: boolean): void {
  const root = document.documentElement
  if (pointer) {
    root.classList.add('side-anim')
    window.setTimeout(() => root.classList.remove('side-anim'), 200)
  }
  setUi({ collapsed: !document.documentElement.classList.contains('collapsed') })
}

export function Header() {
  const s = useUrlState()
  const ui = useUi()
  const stats = useStats()
  const online = useOnline()
  const share = s.prefix.startsWith('/share/')
  const title = SCREENS.find((r) => r.id === s.screen)?.label ?? 'Overview'
  const showRange = s.screen !== 'settings' && s.screen !== 'live'
  const lc = stats.data?.online
  const frozen = !online || (stats.error != null && stats.data != null)
  return (
    <header className="top" id="top">
      <div className="top-in">
        <button
          type="button"
          className="icon-btn menu-btn"
          id="menu-btn"
          aria-label="Open navigation"
          aria-controls="side"
          aria-expanded={ui.drawer}
          onClick={() => setUi({ drawer: !ui.drawer })}
        >
          <MenuIcon size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn collapse-top"
          aria-controls="side"
          aria-expanded={!ui.collapsed}
          aria-label={ui.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-keyshortcuts="["
          onClick={(e) => toggleRail(e.detail > 0)}
        >
          <PanelLeft size={16} aria-hidden="true" />
        </button>
        <h1>{title}</h1>
        {s.screen !== 'live' && s.site !== 'all' && lc != null && (
          <span className="title-extra">
            <RouteLink
              className="live-pill"
              data-frozen={frozen ? '' : undefined}
              patch={{ screen: 'live', tab: '', id: null, sheet: null }}
              aria-label={frozen ? `${lc} visitors online, not updating. Open Live` : `${lc} visitors online now. Open Live`}
            >
              <StatusDot tone={frozen ? 'off' : 'live'} />
              <b>{lc}</b>
              <span>online</span>
            </RouteLink>
          </span>
        )}
        <span className="spacer" />
        <div className="ctrls">
          {showRange && <RangePicker />}
          {showRange && <CompareMenu />}
          {!share && s.screen !== 'settings' && (
            <button type="button" className="btn" aria-label="Share link" aria-haspopup="dialog" aria-expanded={ui.share} onClick={() => setUi({ share: true })}>
              <Link2 size={14} aria-hidden="true" />
              <span className="lbl-hide">Share link</span>
            </button>
          )}
        </div>
      </div>
      <FilterBar />
    </header>
  )
}
