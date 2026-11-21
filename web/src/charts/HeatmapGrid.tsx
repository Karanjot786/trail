// Visitors by weekday and hour (design-system heatmap.md). One role=grid with a single tab stop (roving
// tabindex): arrows move, Home and End jump within the row, Enter, Space or a click picks weekday AND hour,
// and focus stays in the grid. Colour is linear from heat-1 to heat-5; zero cells are heat-0 and outlined.
// The peak gets a 2px fg outline only when one hour clearly stands out.
import { useState, type KeyboardEvent } from 'react'
import './charts.css'

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] // Mon = 0
const WD_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

/** The cell fill: the value's share of the busiest hour, mixed in OKLCH. */
export function heatColor(v: number, max: number): string {
  if (!(v > 0) || !(max > 0)) return 'var(--heat-0)'
  const t = Math.round(Math.min(1, v / max) * 1000) / 10
  return `color-mix(in oklch, var(--heat-5) ${t}%, var(--heat-1))`
}

function fmtAvg(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export interface HeatmapGridProps {
  cells: number[][] // [7 dow, Mon = 0][24 hour]
  max: number
  peak: { dow: number; hour: number; value: number } | null
  clear: boolean
  selected?: { dow: number; hour: number } | null
  onPick: (dow: number, hour: number) => void
  label?: string
}

export function HeatmapGrid({ cells, max, peak, clear, selected, onPick, label = 'Visitors by weekday and hour' }: HeatmapGridProps) {
  const start = selected ?? (peak ? { dow: peak.dow, hour: peak.hour } : { dow: 0, hour: 0 })
  const [focus, setFocus] = useState(start)
  const cellId = (d: number, h: number) => `hm-${d}-${h}`

  const move = (e: KeyboardEvent<HTMLElement>, d: number, h: number) => {
    let nd = d
    let nh = h
    if (e.key === 'ArrowRight') nh = Math.min(23, h + 1)
    else if (e.key === 'ArrowLeft') nh = Math.max(0, h - 1)
    else if (e.key === 'ArrowDown') nd = Math.min(6, d + 1)
    else if (e.key === 'ArrowUp') nd = Math.max(0, d - 1)
    else if (e.key === 'Home') nh = 0
    else if (e.key === 'End') nh = 23
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick(d, h)
      return
    } else return
    e.preventDefault()
    setFocus({ dow: nd, hour: nh })
    const grid = e.currentTarget.closest('[role="grid"]')
    grid?.querySelector<HTMLElement>(`[data-cell="${cellId(nd, nh)}"]`)?.focus()
  }

  return (
    <div className="hm-grid" role="grid" aria-label={label}>
      <div role="row" className="hm-row">
        <span role="columnheader" className="hl">
          <span className="sr-only">Weekday</span>
        </span>
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} role="columnheader" className="hh">
            {h % 3 === 0 && <span aria-hidden="true">{String(h).padStart(2, '0')}</span>}
            <span className="sr-only">{hh(h)}</span>
          </span>
        ))}
      </div>
      {cells.slice(0, 7).map((row, d) => (
        <div key={d} role="row" className="hm-row">
          <span role="rowheader" className="hl">
            <span aria-hidden="true">{WD_SHORT[d]}</span>
            <span className="sr-only">{WEEKDAYS[d]}</span>
          </span>
          {row.slice(0, 24).map((v, h) => {
            const isPeak = clear && !!peak && peak.dow === d && peak.hour === h
            const sel = !!selected && selected.dow === d && selected.hour === h
            const name = `${WEEKDAYS[d]} ${hh(h)}, ${v > 0 ? `${fmtAvg(v)} visitors` : 'nobody'} on average${isPeak ? ', the busiest hour' : ''}`
            return (
              <span
                key={h}
                role="gridcell"
                data-cell={cellId(d, h)}
                className={`hm-cell${v > 0 ? '' : ' zero'}${isPeak ? ' peak' : ''}`}
                style={{ background: heatColor(v, max) }}
                tabIndex={focus.dow === d && focus.hour === h ? 0 : -1}
                aria-selected={sel}
                aria-label={name}
                title={`${WD_SHORT[d]} ${hh(h)} · ${fmtAvg(v)} avg visitors · click to filter`}
                onKeyDown={(e) => move(e, d, h)}
                onClick={() => {
                  setFocus({ dow: d, hour: h })
                  onPick(d, h)
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** The ramp legend: a 0 swatch, then one linear ramp to the busiest cell. */
export function HeatmapLegend({ max }: { max: number }) {
  return (
    <span className="hm-legend">
      <span className="z" aria-hidden="true" />
      <span>0</span>
      <span className="ramp" aria-hidden="true" />
      <span>{fmtAvg(max)}</span>
      <span className="sr-only">average visitors per hour, linear from 0; an outlined cell is 0</span>
    </span>
  )
}
