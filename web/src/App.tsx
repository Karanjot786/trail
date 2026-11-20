import { useEffect, useState, type ReactNode } from 'react'
import { api, isDemo, type Site } from './api'
import { useDashboard } from './state'
import { onUnauthorized, useFetch } from './useFetch'
import { Header } from './components/Header'
import { Login } from './components/Login'
import { FilterChips } from './components/FilterChips'
import { Dashboard } from './Dashboard'
import { TabStrip } from './components/TabStrip'
import { VisitorsView } from './components/VisitorsView'
import { JourneyView } from './components/JourneyView'
import { ReadOnlyToast } from './components/ReadOnlyToast'
import { SettingsView } from './components/SettingsView'

export function App() {
  const [authed, setAuthed] = useState(true)
  const [gen, setGen] = useState(0)
  // The demo never asks for a password.
  useEffect(() => (isDemo ? undefined : onUnauthorized(() => setAuthed(false))), [])
  const { data: sites, error } = useFetch<Site[]>(authed ? `sites|${gen}` : null, (s) => api.sites(s))

  if (!authed)
    return (
      <Login
        onDone={() => {
          setAuthed(true)
          setGen((g) => g + 1)
        }}
      />
    )
  if (error && !sites) return <Centered>Couldn’t reach the Trail server.</Centered>
  if (!sites) return null
  const reload = () => setGen((g) => g + 1)
  // No sites yet: Settings is the whole app until the first one is added.
  if (sites.length === 0)
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-fg">Welcome to Trail</h1>
        <SettingsView onSitesChanged={reload} />
      </div>
    )
  return <Shell sites={sites} onSitesChanged={reload} />
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="grid min-h-dvh place-items-center px-4 text-center text-muted">{children}</main>
}

const VIEWS = [
  { value: 'overview', label: 'Overview' },
  { value: 'visitors', label: 'Visitors' },
  { value: 'settings', label: 'Settings' },
] as const

function Shell({ sites, onSitesChanged }: { sites: Site[]; onSitesChanged: () => void }) {
  const d = useDashboard()
  useEffect(() => {
    if (!sites.some((s) => s.id === d.site)) d.set({ site: sites[0].id })
  }, [sites, d])
  if (!d.site) return null
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6">
      <Header sites={sites} />
      <nav className="-mt-2 flex h-10 border-b border-border" aria-label="Views">
        <TabStrip
          label="Views"
          tabs={isDemo ? VIEWS.slice(0, 2) : [...VIEWS]}
          value={d.view}
          onChange={(view) => d.set({ view, person: '' }, { push: true })}
        />
      </nav>
      {d.view === 'settings' && !isDemo ? (
        <SettingsView onSitesChanged={onSitesChanged} />
      ) : (
        <>
          {!d.person && <FilterChips />}
          {d.person ? <JourneyView person={d.person} /> : d.view === 'visitors' ? <VisitorsView /> : <Dashboard />}
        </>
      )}
      {isDemo && <ReadOnlyToast />}
    </div>
  )
}
