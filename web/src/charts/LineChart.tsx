// The main line chart (§0.10 props). Straight 2px segments, the previous period dashed, the running bucket
// dotted, nulls not drawn, note diamonds and a signup lane. See TimeChart for the shared core.
import type { ReactNode } from 'react'
import type { Note, Point, Window } from '../api/types'
import { fmtValue } from './labels'
import { TimeChart } from './TimeChart'

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
  /** F2 additions (optional): the floating card's content, the live-region text, the lane's label. */
  renderCard?: (i: number) => ReactNode
  describe?: (i: number) => string
  laneLabel?: string
}

export function LineChart({ kind, ...p }: LineChartProps) {
  return <TimeChart mode="line" {...p} integer={kind === 'count'} fmtAxis={(v) => fmtValue(v, kind)} />
}
