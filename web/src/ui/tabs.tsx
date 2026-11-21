// STUB (P0). F1 owns this file (plan §0.10): keep the props, replace the body.
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
}

export function Tabs({ value, onValueChange, items, ariaLabel }: TabsProps) {
  return (
    <div role="tablist" aria-label={ariaLabel}>
      {items.map((it) => (
        <button key={it.value} type="button" role="tab" aria-selected={it.value === value} onClick={() => onValueChange(it.value)}>
          {it.label}
          {it.count != null ? ` ${it.count}` : ''}
        </button>
      ))}
    </div>
  )
}

/** A segmented control: one choice of a few, same props as Tabs. */
export function Segmented({ value, onValueChange, items, ariaLabel }: TabsProps) {
  return (
    <div role="radiogroup" aria-label={ariaLabel}>
      {items.map((it) => (
        <button key={it.value} type="button" role="radio" aria-checked={it.value === value} onClick={() => onValueChange(it.value)}>
          {it.label}
        </button>
      ))}
    </div>
  )
}
