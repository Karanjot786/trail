import { useEffect, useRef, useState } from 'react'
import { Unauthorized } from './api'

type Listener = () => void
const authListeners = new Set<Listener>()
export const onUnauthorized = (f: Listener) => (authListeners.add(f), () => void authListeners.delete(f))

/**
 * Fetch keyed by `key`. Keeps the previous data while the next request is in flight so panels
 * don't flash empty on every filter change; aborts superseded requests.
 */
export function useFetch<T>(key: string | null, fn: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (key === null) return
    const ctl = new AbortController()
    setLoading(true)
    fnRef
      .current(ctl.signal)
      .then((d) => {
        if (ctl.signal.aborted) return
        setData(d)
        setError(null)
        setLoading(false)
      })
      .catch((e: Error) => {
        if (ctl.signal.aborted || e.name === 'AbortError') return
        if (e instanceof Unauthorized) authListeners.forEach((f) => f())
        setError(e)
        setLoading(false)
      })
    return () => ctl.abort()
  }, [key])

  return { data, error, loading }
}
