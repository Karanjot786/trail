// Boot (plan F1-7): the login gate, the share-link and demo modes, the first-site redirect, first-run onboarding
// (no sites, or the Overview of a site that never received an event), then the shell.
import { lazy, Suspense, useEffect, useState } from 'react'
import { invalidate, onUnauthorized } from './api/useQuery'
import { go, invalidRange, linkTo, navigate, useUrlState } from './state/useUrlState'
import { shareView } from './state/url'
import { Shell } from './shell/Shell'
import { Login } from './shell/Login'
import { useSitesQuery } from './shell/useSite'
import { useGone } from './shell/Banners'
import { useDataMode } from './shell/useDataMode'
import { Button } from './ui/button'
import { isSkipped, onboardingRedirect } from './lib/onboarding'

const Onboarding = lazy(() => import('./screens/onboarding/Onboarding'))

export function App() {
  const s = useUrlState()
  const [authed, setAuthed] = useState(true)
  const { mode } = useDataMode()
  const isShare = s.prefix.startsWith('/share/')
  const open = isShare || s.prefix === '/demo' || mode === 'fixtures'
  useEffect(() => (open ? undefined : onUnauthorized(() => setAuthed(false))), [open])
  const { sites, meta } = useSitesQuery()
  const gone = useGone()

  // Keep the URL complete and honest: a site is always named, a share link pins its own site.
  // A share link opens on, and keeps, the view it was saved with; a viewer cannot edit their way out of it.
  const pin = isShare && meta.data ? shareView(s, meta.data.site.id, meta.data.state) : null
  const pinKey = pin ? JSON.stringify(pin) : ''
  const firstSite = sites.data?.[0]?.id
  const noSites = !isShare && sites.data != null && sites.data.length === 0
  const target = onboardingRedirect({ prefix: s.prefix, screen: s.screen, site: s.site, fixtures: mode === 'fixtures' }, sites.data, isSkipped)
  // A stable value for the effect below: the redirect only changes when its tab or site does.
  const welcome = target ? `${target.tab}|${target.site}` : ''
  useEffect(() => {
    if (isShare) {
      if (pin) navigate(pin, { replace: true })
      else if (s.screen === 'settings' || s.screen === 'welcome') navigate({ screen: 'overview', tab: '', id: null }, { replace: true })
    } else if (open && s.screen === 'welcome') {
      navigate({ screen: 'overview', tab: '', id: null, sheet: null }, { replace: true }) // the demo never onboards
    } else if (welcome) {
      const [tab, site] = welcome.split('|')
      navigate({ screen: 'welcome', tab, site, id: null, filters: [], sheet: null }, { replace: true })
    } else if (noSites) {
      if (s.screen !== 'settings' && s.screen !== 'welcome') navigate({ screen: 'settings', tab: 'sites', id: null, sheet: null }, { replace: true })
    } else if (firstSite && !s.site && s.screen !== 'welcome') {
      // Keep an unknown range= as typed, so the page can still say it is not a range Trail knows.
      const bad = invalidRange()
      const url = linkTo({ site: firstSite })
      go(bad == null ? url : `${url}${url.includes('?') ? '&' : '?'}range=${encodeURIComponent(bad)}`, { replace: true })
    }
  }, [isShare, pinKey, firstSite, noSites, s.site, s.screen, open, welcome])

  if (!authed)
    return (
      <Login
        onDone={() => {
          invalidate()
          setAuthed(true)
        }}
      />
    )
  if (isShare) {
    if (!meta.data && !gone) return null
    return <Shell />
  }
  if (sites.error && !sites.data)
    return (
      <main className="center-screen">
        <div className="empty" role="alert" style={{ alignItems: 'center' }}>
          <b>Couldn’t reach the Trail server.</b>
          <p>Check that it is running, then try again.</p>
          <Button size="sm" onClick={() => sites.refetch()}>
            Try again
          </Button>
        </div>
      </main>
    )
  if (!sites.data) return null
  if (s.screen === 'welcome')
    return open ? null : (
      <Suspense fallback={null}>
        <Onboarding />
      </Suspense>
    )
  return <Shell />
}
