import { useEffect, useState, type ReactNode } from 'react'
import { api, type Site } from './api'
import { useDashboard } from './state'
import { onUnauthorized, useFetch } from './useFetch'
import { Header } from './components/Header'
import { Login } from './components/Login'
import { FilterChips } from './components/FilterChips'
import { Dashboard } from './Dashboard'
import { TabStrip } from './components/TabStrip'
import { VisitorsView } from './components/VisitorsView'
import { JourneyView } from './components/JourneyView'

export function App() {
  const [authed, setAuthed] = useState(true)
  const [gen, setGen] = useState(0)
  useEffect(() => onUnauthorized(() => setAuthed(false)), [])
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
  if (sites.length === 0) return <Centered>No sites configured. Set TRAIL_SITES and restart.</Centered>
  return <Shell sites={sites} />
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="grid min-h-dvh place-items-center px-4 text-center text-muted">{children}</main>
}

function Shell({ sites }: { sites: Site[] }) {
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
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'visitors', label: 'Visitors' },
          ]}
          value={d.view}
          onChange={(view) => d.set({ view, person: '' }, { push: true })}
        />
      </nav>
      {!d.person && <FilterChips />}
      {d.person ? <JourneyView person={d.person} /> : d.view === 'visitors' ? <VisitorsView /> : <Dashboard />}
    </div>
  )
}
