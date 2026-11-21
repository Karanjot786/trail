// The rail (plan F1-5; lib shell/sidebar + collapsible-label). The grid snaps; only the labels fade, and only
// on pointer toggles. Under 960 px it is a push drawer with a focus trap, Esc, focus return and a body lock.
import { useEffect, useRef, type ComponentType, type KeyboardEvent } from 'react'
import { Activity, Bot, CircleDollarSign, Compass, ExternalLink, LayoutGrid, Moon, Search, Settings, Sun, Target, Users } from 'lucide-react'
import { SCREENS } from '../routes'
import type { ScreenId } from '../state/url'
import { useUrlState } from '../state/useUrlState'
import { Kbd, StatusDot } from '../ui/small'
import { useLayer } from '../ui/layers'
import { RouteLink } from './RouteLink'
import { SiteSwitcher } from './SiteSwitcher'
import { SavedViews } from './SavedViews'
import { useShowRevenue } from './useSite'
import { useStats } from './useStats'
import { useTheme, toggleTheme } from './theme'
import { setUi, useUi } from './uiStore'
import { useDataMode } from './useDataMode'

export const NAV_ICON: Record<ScreenId, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  overview: LayoutGrid,
  live: Activity,
  acquisition: Compass,
  activity: Users,
  conversions: Target,
  revenue: CircleDollarSign,
  crawlers: Bot,
  settings: Settings,
}
export const NAV_KEY: Record<ScreenId, string> = { overview: 'O', live: 'L', acquisition: 'A', activity: 'V', conversions: 'C', revenue: 'M', crawlers: 'R', settings: 'S' }
export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'

/** The screens shown in the rail, in IA order. Revenue only when the site has revenue; Settings sits at the bottom. */
export function useNavScreens() {
  const showRevenue = useShowRevenue()
  return SCREENS.filter((r) => r.id !== 'settings' && (r.requires !== 'revenue' || showRevenue))
}

export function Sidebar() {
  const s = useUrlState()
  const ui = useUi()
  const { theme } = useTheme()
  const nav = useNavScreens()
  const share = s.prefix.startsWith('/share/')
  const stats = useStats()
  const { mode } = useDataMode()
  const demo = s.prefix === '/demo' || mode === 'fixtures'
  const ref = useRef<HTMLElement>(null)

  // Drawer: Esc closes, focus moves in, then back to the menu button.
  useLayer(ui.drawer, () => setUi({ drawer: false }))
  useEffect(() => {
    if (!ui.drawer) return
    const ret = document.activeElement as HTMLElement | null
    const main = document.getElementById('mainwrap')
    main?.setAttribute('inert', '')
    document.documentElement.classList.add('drawer-open')
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => {
      const f = ref.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? ref.current?.querySelector<HTMLElement>('button, a')
      f?.focus()
    }, 30)
    return () => {
      window.clearTimeout(t)
      main?.removeAttribute('inert')
      document.documentElement.classList.remove('drawer-open')
      document.body.style.overflow = prevOverflow
      const back = ret && document.contains(ret) ? ret : document.getElementById('menu-btn')
      back?.focus()
    }
  }, [ui.drawer])
  useEffect(() => {
    const mq = typeof matchMedia === 'function' ? matchMedia('(max-width: 960px)') : null
    if (!mq) return
    const f = () => {
      if (!mq.matches) setUi({ drawer: false })
    }
    mq.addEventListener?.('change', f)
    return () => mq.removeEventListener?.('change', f)
  }, [])

  const trap = (e: KeyboardEvent) => {
    if (!ui.drawer || e.key !== 'Tab' || !ref.current) return
    const els = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null || el === document.activeElement)
    if (!els.length) return
    const first = els[0]
    const last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  const closeDrawer = () => {
    if (ui.drawer) window.setTimeout(() => setUi({ drawer: false }), 0)
  }
  const online = stats.data?.online
  const live = online != null && s.site !== 'all' ? online : null

  return (
    <>
      <aside className="side" id="side" aria-label="Sidebar" ref={ref} onKeyDown={trap}>
        <div className="side-scroll">
          <SiteSwitcher />
          {!share && (
            <button type="button" className="search-trigger" onClick={(e) => setUi({ palette: { scope: '', instant: e.detail === 0 } })} aria-keyshortcuts="Meta+K Control+K">
              <Search size={16} aria-hidden="true" />
              <span className="clabel">Search or jump to…</span>
              <span className="clabel" aria-hidden="true">
                <Kbd>{`${MOD} K`}</Kbd>
              </span>
            </button>
          )}
          <nav className="nav" aria-label="Main">
            {nav.map((r) => {
              const Icon = NAV_ICON[r.id]
              const cur = s.screen === r.id
              return (
                <RouteLink
                  key={r.id}
                  className="nav-item"
                  patch={{ screen: r.id, tab: '', id: null, sheet: null }}
                  aria-current={cur ? 'page' : undefined}
                  aria-keyshortcuts={`G ${NAV_KEY[r.id]}`}
                  title={ui.collapsed ? r.label : undefined}
                  onClick={closeDrawer}
                >
                  <Icon size={18} aria-hidden />
                  <span className="clabel">{r.label}</span>
                  {r.id === 'live' && live != null && (
                    <span className="clabel end">
                      <StatusDot tone="live" />
                      {live}
                      <span className="sr-only"> online</span>
                    </span>
                  )}
                </RouteLink>
              )
            })}
          </nav>
          {!share && <SavedViews onNavigate={closeDrawer} />}
        </div>
        <div className="side-foot">
          {demo && (
            <div className="bridge">
              <b>Demo · sample data</b>
              <p>{mode === 'fixtures' ? 'Recorded from the demo seed. Live is simulated.' : 'Fictional sites. Every number comes from the demo seed.'}</p>
              <a href="https://github.com/karanjot786/trail" target="_blank" rel="noopener noreferrer">
                Self-host Trail
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </div>
          )}
          <div className="foot-row">
            {!share ? (
              <RouteLink
                className="nav-item"
                patch={{ screen: 'settings', tab: '', id: null, sheet: null }}
                aria-current={s.screen === 'settings' ? 'page' : undefined}
                aria-keyshortcuts="G S"
                title={ui.collapsed ? 'Settings' : undefined}
                onClick={closeDrawer}
              >
                <Settings size={18} aria-hidden="true" />
                <span className="clabel">Settings</span>
              </RouteLink>
            ) : (
              <span className="spacer" />
            )}
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} aria-keyshortcuts="T">
              {theme === 'light' ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </aside>
      {ui.drawer && <button type="button" className="drawer-scrim" tabIndex={-1} aria-label="Close navigation" onClick={() => setUi({ drawer: false })} />}
    </>
  )
}
