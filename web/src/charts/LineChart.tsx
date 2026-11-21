// STUB (P0). F2 owns this file (plan §0.10): keep the props, replace the body.
import type { Note, Point, Window } from '../api/types'

export interface LineChartProps {
  points: Point[]
  prev?: Point[]
  window: Window
  color: string
  height: number
  notes?: Note[]
  lane?: { t: number; count: number }[]
  onHover?: (i: number | null) => void
  onPick?: (i: number) => void
  ariaLabel: string
  kind: 'count' | 'rate' | 'duration'
}

export function LineChart({ ariaLabel, height }: LineChartProps) {
  return (
    <figure aria-label={ariaLabel}>
      <svg aria-hidden="true" height={height} />
    </figure>
  )
}
