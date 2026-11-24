// The app shell (plan F1-5): rail, header with the sticky filter bar, banners, the screen, sheets and
// the shell overlays (⌘K, ?, save view, share, add website). Shortcuts are bound here.
import { lazy, Suspense, useEffect, useMemo, type ComponentType, type LazyExoticComponent } from 'react'
import { SCREENS } from '../routes'
import type { ScreenId } from '../state/url'
import { invalidRange, navigate, useUrlState } from '../state/useUrlState'
import { EmptyState, Skeleton } from '../ui/states'
import { Toaster } from '../ui/toast'
import { Button } from '../ui/button'
import { ShareDialog } from '../screens/settings/ShareDialog'
import { AddSiteDialog } from '../screens/settings/AddSiteDialog'
import { invalidate } from '../api/useQuery'
import { Sidebar } from './Sidebar'
import { Header, toggleRail } from './Header'
import { Banners, RangeNote, useGone } from './Banners'
import { Freshness } from './Freshness'
import { SheetHost } from './SheetHost'
import { CommandPalette } from './CommandPalette'
import { ShortcutsSheet } from './ShortcutsSheet'
import { openSaveView } from './SavedViews'
import { clearFilters } from './FilterBar'
import { shellShortcuts, useShortcuts } from './shortcuts'
import { toggleTheme } from './theme'
import { getUi, setUi, useUi } from './uiStore'
import { useShowRevenue, useSite } from './useSite'
import { useStats } from './useStats'
import { useOnline } from './useOnline'

const SCREEN_COMPONENTS = new Map<ScreenId, LazyExoticComponent<ComponentType>>(SCREENS.map((r) => [r.id, lazy(r.load)]))

function ScreenFallback() {
  return (
    <div aria-busy="true" style={{ display: 'grid', gap: 12 }}>
      <Skeleton height={120} />
      <Skeleton height={320} />
    </div>
  )
}

export function Shell() {
  const s = useUrlState()
  const ui = useUi()
  const { site, sites } = useSite()
  const showRevenue = useShowRevenue()
  const gone = useGone()
  const online = useOnline()
  const stats = useStats(s.screen !== 'settings')
  const share = s.prefix.startsWith('/share/')
  const Screen = SCREEN_COMPONENTS.get(s.screen) ?? SCREEN_COMPONENTS.get('overview')!
  const title = SCREENS.find((r) => r.id === s.screen)?.label ?? 'Overview'

  useEffect(() => {
    document.documentElement.classList.toggle('collapsed', ui.collapsed)
  }, [ui.collapsed])
  useEffect(() => {
    document.documentElement.dataset.screen = s.screen
    document.title = `${title} · ${s.site === 'all' ? 'All websites' : (site?.domain ?? s.site)} · Trail`
  }, [s.screen, s.site, site, title])

  const map = useMemo(
    () =>
      shellShortcuts({
        share,
        screen: s.screen,
        hasFilters: s.filters.length > 0,
        hasRevenue: showRevenue,
        journeyOpen: s.sheet?.kind === 'journey',
        go: (screen) => navigate({ screen, tab: '', id: null, sheet: null }),
        palette: (scope) => setUi({ palette: getUi().palette ? null : { scope: scope ?? '', instant: true } }),
        saveView: () => openSaveView(s.sheet != null),
        shortcuts: () => setUi({ shortcuts: { instant: true } }),
        toggleRail: () => {
          if (typeof matchMedia === 'function' && matchMedia('(max-width: 960px)').matches) return
          toggleRail(false)
        },
        visit: (step) => window.dispatchEvent(new CustomEvent('trail:visit', { detail: step })),
        metric: (metric) => navigate({ metric }),
        clearFilters,
        toggleTheme,
      }),
    [share, s.screen, s.filters.length, showRevenue, s.sheet],
  )
  // While a shell overlay (palette, ?, dialogs) is open its own keys win.
  const overlay = ui.palette != null || ui.shortcuts != null || ui.share || ui.addSite || ui.saveView
  useShortcuts(overlay ? { 'mod+k': () => setUi({ palette: ui.palette ? null : { scope: '', instant: true } }) } : map)

  const unknownSite = !share && s.site !== 'all' && sites.length > 0 && !site
  const greyed = stats.error != null && stats.data != null && online

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar />
      <div className="main" id="mainwrap">
        <Header />
        <Banners />
        <main id="main" tabIndex={-1} className={`page${greyed ? ' stale-wrap' : ''}`}>
          {gone && share ? (
            <EmptyState title="This link has expired or was revoked" body="Ask the person who shared it for a new link." />
          ) : unknownSite ? (
            <EmptyState
              title="This website no longer exists"
              body={`There is no site called “${s.site}” any more. Pick one of the others.`}
              action={
                <Button size="sm" onClick={() => navigate({ site: sites[0].id, filters: [], sheet: null }, { replace: true })}>
                  Open {sites[0].domain}
                </Button>
              }
            />
          ) : (
            <>
              {s.screen !== 'settings' && (
                <>
                  <RangeNote invalid={invalidRange()} />
                  <Freshness />
                </>
              )}
              <Suspense fallback={<ScreenFallback />}>
                <Screen />
              </Suspense>
            </>
          )}
        </main>
      </div>
      <SheetHost />
      {!share && <CommandPalette />}
      <ShortcutsSheet />
      {!share && <ShareDialog open={ui.share} onOpenChange={(o) => setUi({ share: o })} />}
      {!share && (
        <AddSiteDialog
          open={ui.addSite}
          onOpenChange={(o) => setUi({ addSite: o })}
          onAdded={(added) => {
            invalidate('sites')
            setUi({ addSite: false })
            navigate({ screen: 'settings', tab: 'install', site: added.id, filters: [], sheet: null })
          }}
        />
      )}
      <Toaster />
      <div id="live-region" className="sr-only" aria-live="polite" />
    </div>
  )
}
