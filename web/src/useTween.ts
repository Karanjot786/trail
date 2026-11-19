import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Tween a number toward `target` (ease-out, 450 ms). Jumps straight there under reduced motion. */
export function useTween(target: number, ms = 450): number {
  const [v, setV] = useState(target)
  const from = useRef(target)
  const cur = useRef(target)
  useEffect(() => {
    if (reduced() || cur.current === target) {
      cur.current = target
      setV(target)
      return
    }
    from.current = cur.current
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      cur.current = from.current + (target - from.current) * e
      setV(cur.current)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}
