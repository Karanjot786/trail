// STUB (P0). F1 owns this file (plan §0.10, Task F1-2): keep the signatures, replace the body.
import { useSyncExternalStore } from 'react'
import { parseUrl, serializeUrl, type UrlState } from './url'

export type Patch = Partial<UrlState>

const listeners = new Set<() => void>()
let cacheKey = ''
let cache: UrlState | null = null

function current(): UrlState {
  const key = location.pathname + location.search
  if (!cache || key !== cacheKey) {
    cacheKey = key
    cache = parseUrl(location.pathname, location.search).state
  }
  return cache
}

function subscribe(f: () => void) {
  listeners.add(f)
  window.addEventListener('popstate', f)
  return () => {
    listeners.delete(f)
    window.removeEventListener('popstate', f)
  }
}

export function useUrlState(): UrlState {
  return useSyncExternalStore(subscribe, current, current)
}

/** The URL for the current state with `patch` applied, for `<a href>`. */
export function linkTo(patch: Patch): string {
  return serializeUrl({ ...current(), ...patch })
}

export function navigate(patch: Patch, opts: { replace?: boolean } = {}): void {
  const url = linkTo(patch)
  if (opts.replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
  listeners.forEach((f) => f())
}
