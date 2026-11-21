// The shell's stats read: the freshness line, live counts, the range and comparison labels.
import { api } from '../api/client'
import type { Stats } from '../api/types'
import { useQuery } from '../api/useQuery'
import { apiQuery } from '../state/url'
import { useUrlState } from '../state/useUrlState'
import { viewerTz } from './labels'

export function useStats(enabled = true) {
  const s = useUrlState()
  const q = apiQuery(s, viewerTz())
  return useQuery<Stats>(`stats|${q.toString()}|${s.prefix}`, (sig) => api.stats(q, sig), { enabled: enabled && !!s.site, pollMs: 60_000 })
}
