// Stacked bars (crawler categories). Keys keep a fixed order and colour; a 2px surface gap separates
// segments; the data end is rounded. Hover, arrow keys, Home and End read a bucket; a live region announces it.
import { useId, useState, type KeyboardEvent } from 'react'
import type { Window } from '../api/types'
import { fmtInt } from '../lib/format'
import { ChartCard } from './ChartCard'
import { niceTicks } from './geometry'
import { bucketLabel } from './labels'
import { placeCard } from './placeCard'
import { CARD_W, noFloatingCard } from './TimeChart'
import { useWidth } from './useWidth'
import './charts.css'

export interface StackedBarsProps {
  series: { t: number; values: Record<string, number> }[]
  keys: { key: string; label: string; color: string }[]
  window: Window
  height: number
  ariaLabel: string
  /** F2 addition (optional). */
  onHover?: (i: number | null) => void
}

export function StackedBars({ series, keys, window: w, height: H, ariaLabel, onHover }: StackedBarsProps) {
  const [ref, measured] = useWidth<HTMLElement>()
  const W = Math.max(280, measured || 640)
  const padL = 44
  const padR = 4
  const padT = 8
  const plotB = H - 22
  const n = series.length
  const totals = series.map((d) => keys.reduce((a, k) => a + (d.values[k.key] || 0), 0))
  const ticks = niceTicks(Math.max(0, ...totals), { integer: true })
  const top = ticks[ticks.length - 1] || 1
  const bw = (W - padL - padR) / Math.max(1, n)
  const gap = Math.max(1, Math.min(4, bw * 0.25))
  const y = (v: number) => padT + (1 - v / top) * (plotB - padT)
  const [active, setActive] = useState(-1)
  const [floating, setFloating] = useState(false)
  const id = 'sb' + useId().replace(/[^a-zA-Z0-9]/g, '')

  const set = (i: number) => {
    if (i < 0 || !n) {
      setActive(-1)
      onHover?.(null)
      return
    }
    const k = Math.max(0, Math.min(n - 1, i))
    setActive(k)
    setFloating(!noFloatingCard())
    onHover?.(k)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      set(active < 0 ? n - 1 : active + (e.key === 'ArrowRight' ? 1 : -1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      set(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      set(n - 1)
    } else if (e.key === 'Escape' && active >= 0) set(-1)
  }
  const tickN = Math.min(n, W < 520 ? 4 : 7)
  const xTicks = Array.from({ length: tickN }, (_, t) => Math.round((t / (tickN - 1 || 1)) * (n - 1)))
  const say = (i: number) =>
    `${bucketLabel(series[i].t, w)}: ${fmtInt(totals[i])} in all, ` + keys.map((k) => `${k.label} ${fmtInt(series[i].values[k.key] || 0)}`).join(', ')
  const place = active >= 0 ? placeCard(padL + (active + 0.5) * bw, CARD_W, W) : null

  return (
    <figure
      ref={ref}
      className={`tc${active >= 0 ? ' hovering' : ''}`}
      style={{ margin: 0 }}
      aria-label={ariaLabel}
      aria-describedby={`${id}h`}
      tabIndex={0}
      onKeyDown={onKey}
      onBlur={() => set(-1)}
    >
      <span id={`${id}h`} className="sr-only">
        Use left and right arrow keys to read each {w.bucket}.
      </span>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          if (!r.width) return
          const px = ((e.clientX - r.left) / r.width) * W
          const i = Math.floor((px - padL) / bw)
          if (i >= 0 && i < n) set(i)
        }}
        onPointerLeave={() => set(-1)}
      >
        <g className="grid">
          {ticks.map((v) => (
            <line key={v} x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} />
          ))}
        </g>
        <g className="ax">
          {ticks.map((v) => (
            <text key={v} x={padL - 8} y={y(v) + 3.5} textAnchor="end">
              {fmtInt(v)}
            </text>
          ))}
          {xTicks.map((i, t) => (
            <text key={`${i}-${t}`} x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle">
              {bucketLabel(series[i].t, w)}
            </text>
          ))}
        </g>
        {series.map((d, i) => {
          const x0 = padL + i * bw + gap / 2
          const bwid = Math.max(1, bw - gap)
          let acc = 0
          const segs = keys.map((k) => {
            const v = d.values[k.key] || 0
            if (!v) return null
            const y1 = y(acc + v)
            const y0 = y(acc)
            const h = Math.max(0, y0 - y1 - (acc > 0 ? 2 : 0))
            acc += v
            return <rect key={k.key} className="seg" x={x0} y={y1} width={bwid} height={h} rx={Math.min(3, bwid / 3)} fill={k.color} />
          })
          return (
            <g key={d.t} className={`stack${i === active ? ' on' : ''}`}>
              {segs}
            </g>
          )
        })}
      </svg>
      {active >= 0 && floating && place && (
        <div className="ctip" data-testid="chart-card" data-side={place.side} aria-hidden="true" style={{ transform: `translate(${Math.round(place.left)}px, 0px)` }}>
          <ChartCard
            title={bucketLabel(series[active].t, w)}
            rows={[
              ...keys.map((k) => ({ key: k.key, label: k.label, value: fmtInt(series[active].values[k.key] || 0), color: k.color })),
              { key: '_total', label: 'All', value: fmtInt(totals[active]) },
            ]}
          />
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {active >= 0 ? say(active) : ''}
      </p>
    </figure>
  )
}
