// STUB (P0). F1 owns this file (plan §0.10): keep the signature, replace the body.
import type { ShareMeta, Site } from '../api/types'

export interface SiteContext {
  site: Site | null
  sites: Site[]
  share: ShareMeta | null
}

export function useSite(): SiteContext {
  return { site: null, sites: [], share: null }
}
