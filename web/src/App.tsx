// Boot (plan F1-7): the login gate, the share-link and demo modes, the first-site redirect, then the shell.
import { useEffect, useState } from 'react'
import { invalidate, onUnauthorized } from './api/useQuery'
import { go, invalidRange, linkTo, navigate, useUrlState } from './state/useUrlState'
import { Shell } from './shell/Shell'
import { Login } from './shell/Login'
import { useSitesQuery } from './shell/useSite'
import { useGone } from './shell/Banners'
import { useDataMode } from './shell/useDataMode'
import { Button } from './ui/button'

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
  const shareSite = meta.data?.site.id
  const firstSite = sites.data?.[0]?.id
  const noSites = !isShare && sites.data != null && sites.data.length === 0
  useEffect(() => {
    if (isShare) {
      if (shareSite && s.site !== shareSite) navigate({ site: shareSite }, { replace: true })
      else if (s.screen === 'settings') navigate({ screen: 'overview', tab: '', id: null }, { replace: true })
    } else if (noSites) {
      if (s.screen !== 'settings') navigate({ screen: 'settings', tab: 'sites', id: null, sheet: null }, { replace: true })
    } else if (firstSite && !s.site) {
      // Keep an unknown range= as typed, so the page can still say it is not a range Trail knows.
      const bad = invalidRange()
      const url = linkTo({ site: firstSite })
      go(bad == null ? url : `${url}${url.includes('?') ? '&' : '?'}range=${encodeURIComponent(bad)}`, { replace: true })
    }
  }, [isShare, shareSite, firstSite, noSites, s.site, s.screen])

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
  return <Shell />
}
