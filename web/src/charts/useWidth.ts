import { useCallback, useEffect, useRef, useState } from 'react'

/** A callback ref and the element's content width, kept current with a ResizeObserver (0 until measured). */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0)
  const [el, setEl] = useState<T | null>(null)
  const ref = useCallback((node: T | null) => setEl(node), [])
  const frame = useRef(0)
  useEffect(() => {
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => setWidth(Math.round(entries[0]?.contentRect.width ?? 0)))
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(frame.current)
      ro.disconnect()
    }
  }, [el])
  return [ref, width]
}
