// The site switcher at the top of the rail. Read-only and static under a share link.
import { Building2, ChevronsUpDown, Globe, Plus } from 'lucide-react'
import { DropdownMenu as DM } from 'radix-ui'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/menu'
import { Check } from 'lucide-react'
import { navigate, useUrlState } from '../state/useUrlState'
import { useSite } from './useSite'
import { useStats } from './useStats'
import { setUi, useUi } from './uiStore'
import { Mark } from './Mark'

export function SiteSwitcher() {
  const s = useUrlState()
  const { site, sites, share } = useSite()
  const stats = useStats()
  const ui = useUi()
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  const name = s.site === 'all' ? 'All websites' : (site?.domain ?? s.site)
  const sub = share
    ? 'Read-only link'
    : s.site === 'all'
      ? `${sites.length} sites · self-hosted`
      : site && site.lastEventAt == null
        ? 'Waiting for first event'
        : offline
          ? 'Not updating'
          : stats.data
            ? `${stats.data.online} online now`
            : ' '
  const button = (
    <button
      type="button"
      className="switcher"
      data-static={share ? '' : undefined}
      disabled={!!share}
      aria-label={share ? undefined : `Switch site. Current: ${name}`}
    >
      <span className="mark">
        <Mark />
      </span>
      <span className="clabel">
        <span className="who">
          <b>{name}</b>
          <span>{sub}</span>
        </span>
      </span>
      <span className="clabel chev">
        <ChevronsUpDown size={14} aria-hidden="true" />
      </span>
    </button>
  )
  if (share) return button
  const pick = (id: string) => {
    if (id === s.site) return
    navigate({ site: id, filters: [], sheet: null, ...(s.screen === 'conversions' ? { id: null } : {}) })
    if (ui.drawer) setUi({ drawer: false })
  }
  const opts = [{ id: 'all', domain: 'All websites', sub: 'Compare every site at once' }, ...sites.map((x) => ({ id: x.id, domain: x.domain, sub: x.lastEventAt == null ? 'Waiting for first event' : x.id }))]
  return (
    <Menu trigger={button} label="Switch site" side={ui.collapsed ? 'right' : 'bottom'} minWidth={260}>
      <MenuLabel>Websites</MenuLabel>
      {opts.map((o) => {
        const on = o.id === s.site
        return (
          <DM.Item key={o.id} className="mi site-mi" onSelect={() => pick(o.id)} aria-current={on ? 'true' : undefined}>
            <span className="mark-s" data-on={on ? '' : undefined}>
              {o.id === 'all' ? <Building2 size={14} aria-hidden="true" /> : <Globe size={14} aria-hidden="true" />}
            </span>
            <span className="who">
              <b>{o.domain}</b>
              <span>{o.sub}</span>
            </span>
            {on && (
              <span className="end">
                <Check size={14} aria-hidden="true" />
                <span className="sr-only">current</span>
              </span>
            )}
          </DM.Item>
        )
      })}
      <MenuSeparator />
      <MenuItem onSelect={() => setUi({ addSite: true })}>
        <Plus size={14} aria-hidden="true" />
        Add a website
      </MenuItem>
    </Menu>
  )
}
