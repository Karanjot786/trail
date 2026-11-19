import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Text tabs with a 2px white underline that slides (transform only) to the active tab. */
export function TabStrip<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>())
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current.get(value)
      if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    refs.current.forEach((el) => ro.observe(el))
    return () => ro.disconnect()
  }, [value, tabs.length])

  return (
    <div role="tablist" aria-label={label} className={cn('relative flex min-w-0 items-stretch gap-1 overflow-x-auto [scrollbar-width:none]', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          ref={(el) => {
            if (el) refs.current.set(t.value, el)
            else refs.current.delete(t.value)
          }}
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-md px-2 text-[15px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-3',
            t.value === value ? 'text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {t.label}
        </button>
      ))}
      {bar && (
        <span
          aria-hidden
          className="slider pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left bg-white"
          style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w})` }}
        />
      )}
    </div>
  )
}
