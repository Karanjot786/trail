import { useEffect, useState, type ReactNode } from 'react'
import { api, type Site } from './api'
import { useDashboard } from './state'
import { onUnauthorized, useFetch } from './useFetch'
import { Header } from './components/Header'
import { KpiTabs } from './components/KpiTabs'
import { MainChart } from './components/MainChart'
import { Login } from './components/Login'
import { queryKey } from './state'

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
      <Overview />
    </div>
  )
}

function Overview() {
  const d = useDashboard()
  const stats = useFetch(queryKey(d.query, 'stats'), (s) => api.stats(d.query, s))
  const series = useFetch(queryKey(d.query, 'series', d.metric), (s) => api.series(d.query, d.metric, s))
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-black" aria-label="Overview">
      <KpiTabs stats={stats.data} metric={d.metric} onChange={(metric) => d.set({ metric })} />
      <MainChart series={series.data} metric={d.metric} />
    </section>
  )
}
