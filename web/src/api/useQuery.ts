// STUB (P0). F1 owns this file (plan §0.10, Task F1-7): keep the signature, replace the body
// (cache, keep-previous, abort, polling with visibility/offline pause).
import { useCallback, useEffect, useState } from 'react'

export interface QueryOpts {
  staleMs?: number
  pollMs?: number
}
export interface QueryResult<T> {
  data: T | undefined
  error: Error | null
  loading: boolean
  stale: boolean
  refetch: () => void
}

export function useQuery<T>(key: string, fn: (signal: AbortSignal) => Promise<T>, opts: QueryOpts = {}): QueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const refetch = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true)
    fn(ctl.signal).then(
      (d) => {
        if (ctl.signal.aborted) return
        setData(d)
        setError(null)
        setLoading(false)
      },
      (e: unknown) => {
        if (ctl.signal.aborted) return
        setError(e instanceof Error ? e : new Error(String(e)))
        setLoading(false)
      },
    )
    const poll = opts.pollMs ? window.setInterval(() => setTick((n) => n + 1), opts.pollMs) : 0
    return () => {
      ctl.abort()
      if (poll) window.clearInterval(poll)
    }
    // fn is identified by key; a new key refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, opts.pollMs])

  return { data, error, loading, stale: false, refetch }
}
