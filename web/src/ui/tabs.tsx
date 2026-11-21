// Tabs and Segmented (plan §0.10). Roving focus: arrows, Home and End move and select.
import { useRef, type KeyboardEvent } from 'react'

export interface TabItem {
  value: string
  label: string
  count?: number | string
}
export interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  items: TabItem[]
  ariaLabel: string
  /** id prefix for aria-controls wiring: tab `${idBase}-${value}`, panel `${idBase}-${value}-panel`. */
  idBase?: string
}

function useRoving(items: TabItem[], value: string, onValueChange: (v: string) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const onKeyDown = (e: KeyboardEvent) => {
    const i = items.findIndex((it) => it.value === value)
    let n = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % items.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = items.length - 1
    if (n < 0) return
    e.preventDefault()
    onValueChange(items[n].value)
    const btns = ref.current?.querySelectorAll<HTMLButtonElement>('button')
    btns?.[n]?.focus()
  }
  return { ref, onKeyDown }
}

export function Tabs({ value, onValueChange, items, ariaLabel, idBase }: TabsProps) {
  const { ref, onKeyDown } = useRoving(items, value, onValueChange)
  return (
    <div ref={ref} className="tabs" role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {items.map((it) => {
        const on = it.value === value
        return (
          <button
            key={it.value}
            id={idBase ? `${idBase}-${it.value}` : undefined}
            aria-controls={idBase ? `${idBase}-${it.value}-panel` : undefined}
            type="button"
            role="tab"
            className="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onValueChange(it.value)}
          >
            {it.label}
            {it.count != null && <span className="n">{it.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** A segmented control: one choice of a few, same props as Tabs. */
export function Segmented({ value, onValueChange, items, ariaLabel }: TabsProps) {
  const { ref, onKeyDown } = useRoving(items, value, onValueChange)
  return (
    <div ref={ref} className="seg" role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {items.map((it) => {
        const on = it.value === value
        return (
          <button key={it.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onValueChange(it.value)}>
            {it.label}
            {it.count != null && <span className="n">{it.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
