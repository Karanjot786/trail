import { useEffect, useState } from 'react'
import { ChevronRightIcon, SearchIcon, UsersIcon } from 'lucide-react'
import { api } from '@/api'
import { queryKey, useDashboard } from '@/state'
import { useFetch } from '@/useFetch'
import { num } from '@/format'
import { DeviceIcon, Favicon, Flag } from '@/dims'
import { countryName } from '@/flags'
import { fmtDateTime } from '@/time'
import { EmptyState } from './EmptyState'

export const shortPerson = (p: string, identified: boolean) => (identified ? p : `#${p.replace(/-/g, '').slice(-4)}`)

export function VisitorsView() {
  const d = useDashboard()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 200)
    return () => clearTimeout(id)
  }, [q])
  const { data: rows, loading } = useFetch(queryKey(d.query, 'visitors', debounced), (s) =>
    api.visitors(d.query, { q: debounced, limit: 200 }, s),
  )

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-black" aria-label="Visitors">
      <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <label className="flex h-10 w-full items-center gap-3 rounded-lg border border-border-strong bg-black px-3 focus-within:ring-2 focus-within:ring-ring sm:max-w-sm">
          <SearchIcon className="size-[18px] shrink-0 text-muted" strokeWidth={1.5} aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by user id"
            aria-label="Search visitors by user id"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle"
          />
        </label>
        <p className="num shrink-0 text-sm text-muted" aria-live="polite">
          {rows ? `${num(rows.length)}${rows.length >= 200 ? '+' : ''} visitors` : ' '}
        </p>
      </div>

      {rows?.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No visitors">
          Nobody matches this range{debounced ? ' and search' : ''}.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="w-full min-w-0 table-fixed text-left text-[15px]">
            <thead>
              <tr className="text-[13px] font-medium uppercase tracking-[0.02em] text-muted [&>th]:h-11 [&>th]:px-3 [&>th]:font-medium sm:[&>th]:px-4">
                <th className="w-auto">Person</th>
                <th className="hidden w-48 md:table-cell">Location</th>
                <th className="hidden w-40 lg:table-cell">First source</th>
                <th className="w-16 text-right sm:w-20">Visits</th>
                <th className="hidden w-36 lg:table-cell">First seen</th>
                <th className="w-32 sm:w-36">Last seen</th>
                <th className="w-8" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((v) => (
                <tr
                  key={v.person}
                  tabIndex={0}
                  onClick={() => d.set({ person: v.person }, { push: true })}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), d.set({ person: v.person }, { push: true }))}
                  className="group cursor-pointer border-t border-border outline-none transition-colors duration-150 hover:bg-card focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&>td]:h-12 [&>td]:px-3 sm:[&>td]:px-4"
                >
                  <td>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="md:hidden">
                        <Flag code={v.country} />
                      </span>
                      <span className={v.identified ? 'truncate font-medium text-fg' : 'num truncate font-mono text-sm text-muted'}>
                        {shortPerson(v.person, v.identified)}
                      </span>
                      {v.identified && (
                        <span className="shrink-0 rounded-md bg-good-bg px-1.5 py-0.5 text-xs font-medium text-good">identified</span>
                      )}
                    </span>
                  </td>
                  <td className="hidden md:table-cell">
                    <span className="flex min-w-0 items-center gap-2 text-fg">
                      <Flag code={v.country} />
                      <span className="truncate">{countryName(v.country)}</span>
                      <DeviceIcon device={v.device} />
                    </span>
                  </td>
                  <td className="hidden lg:table-cell">
                    <span className="flex min-w-0 items-center gap-2">
                      {v.source ? <Favicon host={v.source} /> : null}
                      <span className={v.source ? 'truncate text-fg' : 'text-muted'}>{v.source || 'Direct'}</span>
                    </span>
                  </td>
                  <td className="num text-right font-medium">{num(v.visits)}</td>
                  <td className="num hidden truncate text-muted lg:table-cell">{fmtDateTime(v.firstSeen)}</td>
                  <td className="num truncate text-muted">{fmtDateTime(v.lastSeen)}</td>
                  <td>
                    <ChevronRightIcon className="size-4 text-subtle transition-colors group-hover:text-fg" strokeWidth={1.5} aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
