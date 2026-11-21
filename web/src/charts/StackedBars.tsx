// STUB (P0). F2 owns this file (plan §0.10): keep the props, replace the body.
import type { Window } from '../api/types'

export interface StackedBarsProps {
  series: { t: number; values: Record<string, number> }[]
  keys: { key: string; label: string; color: string }[]
  window: Window
  height: number
  ariaLabel: string
}

export function StackedBars({ ariaLabel, height }: StackedBarsProps) {
  return (
    <figure aria-label={ariaLabel}>
      <svg aria-hidden="true" height={height} />
    </figure>
  )
}
