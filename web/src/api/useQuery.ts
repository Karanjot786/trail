// useQuery (plan §0.10, Task F1-7): an in-memory cache by key, keep-previous data while refetching,
// abort of superseded requests, polling that pauses while the tab is hidden or the browser is offline,
// `stale` (data older than 10 minutes), and the two app-wide signals: Unauthorized → login gate, Gone → share banner.
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { Gone, Unauthorized } from './client'
import { useUrlState } from '../state/useUrlState'

export interface QueryOpts {
  staleMs?: number
  pollMs?: number
  /** false skips fetching (the hook returns the cached value, if any). */
  enabled?: boolean
  /** Keep the previous key's data on screen while a new key loads (default true; never across a site switch). */
  keepPrevious?: boolean
  /** Also keep the previous key's data (same site only) when the new key fails; for views whose subject is unchanged and only the window moves. */
  keepOnError?: boolean
}
export interface QueryResult<T> {
  data: T | undefined
  error: Error | null
  loading: boolean
  stale: boolean
  refetch: () => void
  /** When the shown data arrived (ms), or null. */
  updatedAt: number | null
}

interface Entry {
  data?: unknown
  at: number
  error: Error | null
}
const cache = new Map<string, Entry>()
/** The cache holds at most this many keys; the least recently set go first. */
export const CACHE_MAX = 300
function setCache(key: string, e: Entry): void {
  cache.delete(key)
  cache.set(key, e)
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
}
// One request per key at a time: a second hook with the same key joins the request in flight.
const inflight = new Map<string, { p: Promise<unknown>; users: number; ctl: AbortController }>()
export const STALE_AFTER_MS = 10 * 60_000

type Signal = 'unauthorized' | 'gone'
const signals: Record<Signal, Set<(e: Error) => void>> = { unauthorized: new Set(), gone: new Set() }
export function onUnauthorized(f: () => void): () => void {
  signals.unauthorized.add(f)
  return () => void signals.unauthorized.delete(f)
}
export function onGone(f: (e: Error) => void): () => void {
  signals.gone.add(f)
  return () => void signals.gone.delete(f)
}
/** Reports an error thrown outside useQuery (a write) to the same gates. */
export function reportError(e: unknown): void {
  if (e instanceof Unauthorized) signals.unauthorized.forEach((f) => f(e))
  else if (e instanceof Gone) signals.gone.forEach((f) => f(e))
}

/** Drops cached entries (all, or those whose key starts with `prefix`), e.g. after a write or a login. */
export function invalidate(prefix = ''): void {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k)
  // Mounted hooks on those keys fetch again, so a write shows up without a reload.
  for (const f of [...mounted]) f(prefix)
}
const mounted = new Set<(prefix: string) => void>()

const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

export function useQuery<T>(key: string, fn: (signal: AbortSignal) => Promise<T>, opts: QueryOpts = {}): QueryResult<T> {
  const { staleMs = 30_000, pollMs, enabled = true, keepPrevious = true, keepOnError = false } = opts
  const { site, prefix } = useUrlState()
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const ctl = useRef<AbortController | null>(null)
  const loading = useRef(false)
  const wasLoading = useRef(false)
  // The last data this hook showed, so a new key keeps the previous numbers on screen while it loads.
  const shown = useRef<{ data?: unknown; at: number | null; scope: string }>({ at: null, scope: '' })
  // Previous data is only ever shown within the same site (and share link).
  const scope = `${prefix}|${site}`

  const run = useCallback(() => {
    ctl.current?.abort()
    const mine = new AbortController()
    ctl.current = mine
    let req = inflight.get(key)
    if (!req) {
      const c = new AbortController()
      const p = fnRef.current(c.signal)
      req = { p, users: 0, ctl: c }
      const r = req
      inflight.set(key, r)
      p.then(
        (data) => {
          if (c.signal.aborted) return
          setCache(key, { data, at: Date.now(), error: null })
        },
        (e: unknown) => {
          if (c.signal.aborted) return
          const err = e instanceof Error ? e : new Error(String(e))
          const prev = cache.get(key)
          setCache(key, { data: prev?.data, at: prev?.at ?? 0, error: err })
          reportError(err)
        },
      ).finally(() => {
        if (inflight.get(key) === r) inflight.delete(key)
      })
    }
    const r = req
    r.users++
    // This hook leaves the request exactly once: on abort (superseded, key change, disabled, unmount) or on settle.
    let done = false
    mine.signal.addEventListener('abort', () => {
      if (ctl.current === mine) loading.current = false
      if (done) return
      done = true
      if (--r.users <= 0 && inflight.get(key) === r) {
        inflight.delete(key)
        r.ctl.abort()
      }
    })
    loading.current = true
    rerender()
    r.p.then(
      () => undefined,
      () => undefined,
    ).then(() => {
      if (mine.signal.aborted || done) return
      done = true
      r.users--
      loading.current = false
      rerender()
    })
  }, [key])

  useEffect(() => {
    if (!enabled) {
      // A request that was in flight was just aborted by the cleanup: repaint without its loading state.
      if (wasLoading.current) {
        wasLoading.current = false
        rerender()
      }
      return
    }
    wasLoading.current = false
    const hit = cache.get(key)
    if (!hit || hit.error || hit.data === undefined || Date.now() - hit.at >= staleMs) run()
    else rerender()
    return () => {
      wasLoading.current = loading.current
      ctl.current?.abort()
    }
  }, [key, enabled, staleMs, run])

  useEffect(() => {
    if (!enabled) return
    const f = (prefix: string) => {
      if (key.startsWith(prefix)) run()
    }
    mounted.add(f)
    return () => void mounted.delete(f)
  }, [key, enabled, run])

  useEffect(() => {
    if (!enabled || !pollMs) return
    let id = 0
    const start = () => {
      if (id || document.hidden || !online()) return
      id = window.setInterval(() => {
        if (!document.hidden && online() && !loading.current) run()
      }, pollMs)
    }
    const stop = () => {
      window.clearInterval(id)
      id = 0
    }
    const onVis = () => {
      if (document.hidden) stop()
      else {
        if (!loading.current) run()
        start()
      }
    }
    const onOnline = () => {
      if (!loading.current) run()
      start()
    }
    start()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('offline', stop)
    window.addEventListener('online', onOnline)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('offline', stop)
      window.removeEventListener('online', onOnline)
    }
  }, [enabled, pollMs, run])

  const entry = cache.get(key)
  if (entry && entry.data !== undefined) shown.current = { data: entry.data, at: entry.at, scope }
  const prevOk = keepPrevious && shown.current.scope === scope && (keepOnError || !entry?.error)
  const data = (entry?.data ?? (prevOk ? shown.current.data : undefined)) as T | undefined
  const at = entry?.data !== undefined ? entry.at : prevOk ? shown.current.at : null
  return {
    data,
    error: entry?.error ?? null,
    loading: loading.current || (enabled && !entry),
    stale: at != null && Date.now() - at > STALE_AFTER_MS,
    refetch: run,
    updatedAt: at,
  }
}
