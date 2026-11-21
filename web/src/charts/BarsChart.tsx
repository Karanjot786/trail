// Bars for discrete things (purchases, revenue): rounded data ends, square on the baseline,
// the previous period as dashed ticks (§0.10 props). See TimeChart for the shared core.
import type { ReactNode } from 'react'
import type { Point, Window } from '../api/types'
import { fmtValue } from './labels'
import { TimeChart } from './TimeChart'

export interface BarsChartProps {
  points: Point[]
  prev?: Point[]
  window: Window
  color: string
  height: number
  ariaLabel: string
  money?: string // ISO currency when the values are minor units
  /** F2 additions (optional). */
  onHover?: (i: number | null) => void
  onPick?: (i: number) => void
  renderCard?: (i: number) => ReactNode
  describe?: (i: number) => string
}

export function BarsChart({ money, ...p }: BarsChartProps) {
  return <TimeChart mode="bars" {...p} integer fmtAxis={(v) => (money ? fmtValue(v, 'money', money) : fmtValue(v, 'count'))} />
}
