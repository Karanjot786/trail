// useSite (plan §0.10): the current site, every site, and the share meta when under /share/{token}.
import { api } from '../api/client'
import type { ShareMeta, Site } from '../api/types'
import { useQuery, type QueryResult } from '../api/useQuery'
import { useUrlState } from '../state/useUrlState'

export interface SiteContext {
  site: Site | null
  sites: Site[]
  share: ShareMeta | null
}

export function useSitesQuery(): { sites: QueryResult<Site[]>; meta: QueryResult<ShareMeta>; isShare: boolean } {
  const { prefix } = useUrlState()
  const isShare = prefix.startsWith('/share/')
  const sites = useQuery('sites', (s) => api.sites(s), { enabled: !isShare, staleMs: 60_000 })
  const meta = useQuery(`share-meta|${prefix}`, (s) => api.shareMeta(s), { enabled: isShare, staleMs: 60_000 })
  return { sites, meta, isShare }
}

export function useSite(): SiteContext {
  const { site: id } = useUrlState()
  const { sites, meta, isShare } = useSitesQuery()
  const list = isShare ? (meta.data ? [meta.data.site] : []) : (sites.data ?? [])
  const site = id === 'all' ? null : (list.find((s) => s.id === id) ?? null)
  return { site, sites: list, share: isShare ? (meta.data ?? null) : null }
}

/** Revenue shows only when the site has ever sent a Purchase, and never in a share that hides it. */
export function useShowRevenue(): boolean {
  const { site, share } = useSite()
  const { hideRevenue } = useUrlState()
  if (share && (share.hideRevenue || hideRevenue)) return false
  return !!site?.features?.revenue
}
