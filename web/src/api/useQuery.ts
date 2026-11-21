// useQuery (plan §0.10, Task F1-7): an in-memory cache by key, keep-previous data while refetching,
// abort of superseded requests, polling that pauses while the tab is hidden or the browser is offline,
// `stale` (data older than 10 minutes), and the two app-wide signals: Unauthorized → login gate, Gone → share banner.
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { Gone, Unauthorized } from './client'

export interface QueryOpts {
  staleMs?: number
  pollMs?: number
  /** false skips fetching (the hook returns the cached value, if any). */
  enabled?: boolean
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
  const { staleMs = 30_000, pollMs, enabled = true } = opts
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const ctl = useRef<AbortController | null>(null)
  const loading = useRef(false)
  // The last data this hook showed, so a new key keeps the previous numbers on screen while it loads.
  const shown = useRef<{ data?: unknown; at: number | null }>({ at: null })

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
          cache.set(key, { data, at: Date.now(), error: null })
        },
        (e: unknown) => {
          if (c.signal.aborted) return
          const err = e instanceof Error ? e : new Error(String(e))
          const prev = cache.get(key)
          cache.set(key, { data: prev?.data, at: prev?.at ?? 0, error: err })
          reportError(err)
        },
      ).finally(() => {
        if (inflight.get(key) === r) inflight.delete(key)
      })
    }
    const r = req
    r.users++
    // Superseded or unmounted: drop out; the shared request is aborted when nobody waits for it.
    mine.signal.addEventListener('abort', () => {
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
      if (mine.signal.aborted) return
      r.users--
      loading.current = false
      rerender()
    })
  }, [key])

  useEffect(() => {
    if (!enabled) return
    const hit = cache.get(key)
    if (!hit || hit.error || hit.data === undefined || Date.now() - hit.at >= staleMs) run()
    else rerender()
    return () => ctl.current?.abort()
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
        if (!document.hidden && online()) run()
      }, pollMs)
    }
    const stop = () => {
      window.clearInterval(id)
      id = 0
    }
    const onVis = () => {
      if (document.hidden) stop()
      else {
        run()
        start()
      }
    }
    const onOnline = () => {
      run()
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
  if (entry && entry.data !== undefined) shown.current = { data: entry.data, at: entry.at }
  const data = (entry?.data ?? shown.current.data) as T | undefined
  const at = entry?.data !== undefined ? entry.at : shown.current.at
  return {
    data,
    error: entry?.error ?? null,
    loading: loading.current || (enabled && !entry),
    stale: at != null && Date.now() - at > STALE_AFTER_MS,
    refetch: run,
    updatedAt: at,
  }
}
