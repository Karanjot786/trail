// Overview data hooks. Keys match the shell's (`stats|…`) so one request feeds every reader.
import { api } from '../../api/client'
import type { Metric, Note, Series } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import { viewerTz } from '../../shell/labels'
import { apiQuery } from '../../state/url'
import { useUrlState } from '../../state/useUrlState'

export function useApiQuery() {
  const s = useUrlState()
  const tz = viewerTz()
  const q = apiQuery(s, tz)
  return { s, tz, q, key: `${q.toString()}|${s.prefix}` }
}

/** One metric's series with its previous period and per-bucket extras. */
export function useSeries(metric: Metric, enabled = true) {
  const { s, q, key } = useApiQuery()
  return useQuery<Series>(`series|${metric}|${key}`, async (sig) => api.series(q, metric, true, sig), { enabled: enabled && !!s.site && s.site !== 'all' })
}

/** Notes in the range (deploys, campaigns). A failure only hides the diamonds. */
export function useNotes() {
  const { s, q, key } = useApiQuery()
  const r = useQuery<Note[]>(`notes|${key}`, async (sig) => api.notes(q, sig), { enabled: !!s.site && s.site !== 'all', staleMs: 60_000 })
  return r.error ? [] : (r.data ?? [])
}
