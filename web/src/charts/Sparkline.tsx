// A sparkline: one thin line (optionally a soft area) with no axes, breaking at null buckets.
// Decorative: the number beside it carries the meaning, so it is hidden from screen readers.
import { pathFor } from './geometry'

export interface SparklineProps {
  values: (number | null)[]
  width?: number
  height?: number
  color?: string
  area?: boolean
  className?: string
}

export function Sparkline({ values, width = 64, height = 22, color = 'var(--chart-1)', area = false, className }: SparklineProps) {
  const pad = 2
  const max = Math.max(1, ...values.filter((v): v is number => v != null && Number.isFinite(v)))
  const n = values.length
  const x = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * width)
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2)
  const d = pathFor(values, x, y)
  const first = values.findIndex((v) => v != null)
  const last = values.reduce<number>((m, v, i) => (v != null ? i : m), -1)
  const fill = area && first >= 0 ? `${pathFor(values.slice(0, last + 1), x, y)} L${x(last).toFixed(1)} ${height} L${x(first).toFixed(1)} ${height} Z` : ''
  return (
    <svg className={className ?? 'spark'} viewBox={`0 0 ${width} ${height}`} width={width} height={height} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {fill && <path d={fill} fill="var(--accent-soft)" stroke="none" />}
      <path className="spark-line" d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
