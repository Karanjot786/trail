// STUB (P0). F2 owns this file (plan §0.10): keep the props, replace the body.
import type { Point, Window } from '../api/types'

export interface BarsChartProps {
  points: Point[]
  prev?: Point[]
  window: Window
  color: string
  height: number
  ariaLabel: string
  money?: string // ISO currency when the values are minor units
}

export function BarsChart({ ariaLabel, height }: BarsChartProps) {
  return (
    <figure aria-label={ariaLabel}>
      <svg aria-hidden="true" height={height} />
    </figure>
  )
}
