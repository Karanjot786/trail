// The one time-series chart core (port of proto-d js/charts.js lineChart): line or bars, the previous
// period dashed, the running bucket dotted, null buckets not drawn, note diamonds, a signup lane, a hairline,
// keyboard stepping, a live region and, on fine pointers wider than 640px, the floating card.
// LineChart and BarsChart are thin wrappers that keep the §0.10 props.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { Note, Point, Window } from '../api/types'
import { bucketIndex, laneMarks, niceTicks, pathFor, scaleX, todaySegment } from './geometry'
import { bucketLabel } from './labels'
import { placeCard } from './placeCard'
import { useWidth } from './useWidth'
import './charts.css'

export const CARD_W = 272

export interface TimeChartProps {
  mode: 'line' | 'bars'
  points: Point[]
  prev?: Point[]
  window: Window
  color: string
  height: number
  ariaLabel: string
  fmtAxis: (v: number) => string
  integer: boolean
  notes?: Note[]
  lane?: { t: number; count: number }[]
  laneLabel?: string
  onHover?: (i: number | null) => void
  onPick?: (i: number) => void
  /** Content of the floating card for bucket i (fine pointers, > 640px). */
  renderCard?: (i: number) => ReactNode
  /** What the live region reads for bucket i. */
  describe?: (i: number) => string
}

/** No hover on this device, or a narrow window: the header readout replaces the card. */
export function noFloatingCard(): boolean {
  if (typeof window === 'undefined') return true
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(hover: none), (pointer: coarse)').matches
  return coarse || window.innerWidth <= 640
}

function barPath(x: number, y: number, w: number, h: number, r: number): string {
  // Rounded data end, square on the baseline.
  const rr = Math.min(r, w / 2, h)
  return `M${x.toFixed(1)} ${(y + h).toFixed(1)} V${(y + rr).toFixed(1)} Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + rr).toFixed(1)} ${y.toFixed(1)} H${(x + w - rr).toFixed(1)} Q${(x + w).toFixed(1)} ${y.toFixed(1)} ${(x + w).toFixed(1)} ${(y + rr).toFixed(1)} V${(y + h).toFixed(1)} Z`
}

export function TimeChart(o: TimeChartProps) {
  const [wrapRef, measured] = useWidth<HTMLElement>()
  const W = Math.max(280, measured || 640)
  const H = o.height
  const bars = o.mode === 'bars'
  const hasLane = !!o.lane?.some((l) => l.count > 0)
  const padL = hasLane ? 58 : 44
  const padR = 8
  const padT = 14
  const axisH = 22
  const laneH = hasLane ? 30 : 0
  const plotB = H - axisH - laneH
  const plotW = W - padL - padR
  const n = o.points.length
  const values = o.points.map((p) => p.v)
  const prevVals = o.prev?.map((p) => p.v) ?? null
  const last = values.reduce<number>((m, v, i) => (v != null ? i : m), -1)
  const maxI = Math.max(0, last)

  const ticks = useMemo(() => {
    const all = [...values, ...(prevVals ?? [])].filter((v): v is number => v != null && Number.isFinite(v))
    return niceTicks(Math.max(0, ...all), { integer: o.integer })
  }, [values.join(), prevVals?.join(), o.integer]) // eslint-disable-line react-hooks/exhaustive-deps
  const top = ticks[ticks.length - 1] || 1
  const bw = plotW / Math.max(1, n)
  const x = (i: number) => (bars ? padL + (i + 0.5) * bw : padL + scaleX(i, n, plotW))
  const y = (v: number) => padT + (1 - v / top) * (plotB - padT)

  const [active, setActive] = useState(-1)
  const [floating, setFloating] = useState(false)
  const lastPointer = useRef('mouse')
  const rawId = useId()
  const id = 'tc' + rawId.replace(/[^a-zA-Z0-9]/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLElement | null>(null)

  const set = (i: number) => {
    if (i < 0 || n === 0) {
      if (active !== -1) setActive(-1)
      o.onHover?.(null)
      return
    }
    const k = Math.max(0, Math.min(maxI, i))
    setActive(k)
    setFloating(!!o.renderCard && !noFloatingCard())
    o.onHover?.(k)
  }

  // A tap anywhere outside dismisses the reading (touch has no pointerleave).
  useEffect(() => {
    if (active < 0) return
    const outside = (e: Event) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) set(-1)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  })

  const idxAt = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || !r.width) return -1
    const px = ((clientX - r.left) / r.width) * W
    if (px < padL - 6 || px > W - padR + 6) return -1
    return bars ? Math.floor((px - padL) / bw) : Math.round(((px - padL) / Math.max(1, plotW)) * (n - 1))
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') return
    const i = idxAt(e.clientX)
    if (i >= 0) set(i)
  }
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const i = idxAt(e.clientX)
    if (i < 0) return
    const k = Math.min(maxI, i)
    // Touch: the first tap reads, the second tap on the same bucket picks it.
    if (lastPointer.current === 'touch' && k !== active) return set(k)
    set(k)
    o.onPick?.(k)
  }
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const k = e.key
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      e.preventDefault()
      set(active < 0 ? maxI : active + (k === 'ArrowRight' ? 1 : -1))
    } else if (k === 'Home') {
      e.preventDefault()
      set(0)
    } else if (k === 'End') {
      e.preventDefault()
      set(maxI)
    } else if (k === 'Enter' && active >= 0 && o.onPick) {
      e.preventDefault()
      o.onPick(active)
    } else if (k === 'Escape' && active >= 0) {
      set(-1)
    }
  }

  // Lines: the running bucket is dotted when the window is still under way.
  const running = !bars && o.window.elapsed && last === o.window.lastBucket
  const seg = running ? todaySegment(values, last) : { solid: values, dotted: null }
  const line = bars ? '' : pathFor(seg.solid, x, y)
  const partial = seg.dotted ? pathFor(values.map((v, i) => (i === seg.dotted![0] || i === seg.dotted![1] ? v : null)), x, y) : ''
  const prevLine = !bars && prevVals ? pathFor(prevVals, x, y) : ''
  const firstReal = values.findIndex((v) => v != null)
  const area = !bars && last >= 0 && firstReal >= 0 ? `${pathFor(values.slice(0, last + 1), x, y)} L${x(last).toFixed(1)} ${plotB} L${x(firstReal).toFixed(1)} ${plotB} Z` : ''
  const markers = !bars && plotW / Math.max(1, n) >= 40

  const tickN = Math.min(n, W < 520 ? 4 : 7)
  const xTicks = Array.from({ length: tickN }, (_, t) => Math.round((t / (tickN - 1 || 1)) * (n - 1)))

  const notes = (o.notes ?? []).map((nt) => ({ nt, i: bucketIndex(o.points, nt.ts) })).filter((m) => m.i >= 0)
  const laneIdx = (o.lane ?? []).map((l) => ({ i: bucketIndex(o.points, l.t), count: l.count })).filter((l) => l.i >= 0)
  const lane = hasLane ? laneMarks(laneIdx, bw) : null

  // Card position: measured height, clamped inside the chart; flips left near the right edge.
  const [cardTop, setCardTop] = useState(0)
  const cardOn = floating && active >= 0 && !!o.renderCard
  const px = active >= 0 ? x(active) : 0
  const py = active >= 0 ? y(values[active] ?? 0) : 0
  useLayoutEffect(() => {
    if (!cardOn) return
    const ch = cardRef.current?.offsetHeight ?? 0
    setCardTop(Math.max(-8, Math.min(py - 28, H - ch - 4)))
  }, [cardOn, active, py, H])
  const place = placeCard(px, CARD_W, W)

  const hint = `Use left and right arrow keys to read each ${o.window.bucket}${o.onPick ? '; Enter picks it' : ''}.`
  const live = active >= 0 ? (o.describe ? o.describe(active) : `${bucketLabel(o.points[active].t, o.window)}: ${values[active] == null ? 'no data' : o.fmtAxis(values[active] as number)}`) : ''

  return (
    <figure
      ref={(el) => {
        rootRef.current = el
        wrapRef(el)
      }}
      className={`tc${active >= 0 ? ' hovering' : ''}${bars ? ' is-bars' : ''}`}
      style={{ ['--series' as string]: o.color, margin: 0 }}
      aria-label={o.ariaLabel}
      aria-describedby={`${id}h`}
      tabIndex={0}
      onKeyDown={onKey}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) set(-1)
      }}
    >
      <span id={`${id}h`} className="sr-only">
        {hint}
      </span>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        onPointerMove={onMove}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'touch') set(-1)
        }}
        onClick={onClick}
      >
        <defs>
          <pattern id={`${id}p`} width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill="none" />
            <circle cx="3.5" cy="3.5" r="1.15" fill={o.color} />
          </pattern>
          <linearGradient id={`${id}g`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity=".95" />
            <stop offset="1" stopColor="white" stopOpacity=".12" />
          </linearGradient>
          <mask id={`${id}m`}>
            <rect x="0" y="0" width={W} height={H} fill={`url(#${id}g)`} />
          </mask>
        </defs>
        <g className="grid">
          {ticks.map((v) => (
            <line key={v} x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} />
          ))}
        </g>
        <g className="ax">
          {ticks.map((v) => (
            <text key={v} x={padL - 8} y={y(v) + 3.5} textAnchor="end">
              {o.fmtAxis(v)}
            </text>
          ))}
          {xTicks.map((i, t) => (
            <text key={`${i}-${t}`} x={x(i)} y={H - 6} textAnchor={bars ? 'middle' : t === 0 ? 'start' : t === tickN - 1 ? 'end' : 'middle'}>
              {bucketLabel(o.points[i].t, o.window)}
            </text>
          ))}
        </g>
        {area && <path d={area} fill={`url(#${id}p)`} mask={`url(#${id}m)`} opacity=".75" />}
        {bars &&
          values.map((v, i) => {
            if (v == null || !v) return null
            const w = Math.max(2, bw * 0.62)
            const yy = y(v)
            return <path key={i} className={`vbar${i === active ? ' on' : ''}`} d={barPath(x(i) - w / 2, yy, w, Math.max(1, plotB - yy), 4)} />
          })}
        {bars &&
          prevVals?.map((v, i) =>
            v == null || !v ? null : <line key={i} className="ptick" x1={x(i) - bw * 0.36} x2={x(i) + bw * 0.36} y1={y(v)} y2={y(v)} />,
          )}
        {prevLine && <path className="prev" d={prevLine} />}
        {notes.map(({ nt, i }) => (
          <g key={nt.id} className="note">
            <line className="note-l" x1={x(i)} x2={x(i)} y1={padT - 2} y2={plotB} />
            <rect className="note-m" x={x(i) - 5} y={padT - 9} width="10" height="10" rx="2" transform={`rotate(45 ${x(i)} ${padT - 4})`} />
          </g>
        ))}
        {line && <path className="line" d={line} />}
        {partial && <path className="line partial" d={partial} />}
        {markers && values.map((v, i) => (v == null ? null : <circle key={i} className="pt" cx={x(i)} cy={y(v)} r="3" />))}
        {lane && (
          <g className="lane">
            <text className="lane-label" x={padL - 8} y={plotB + 23} textAnchor="end">
              {(o.laneLabel ?? 'Goal') + (lane.weekly ? '/wk' : '')}
            </text>
            <line className="lane-base" x1={padL} x2={W - padR} y1={plotB + 19} y2={plotB + 19} />
            {lane.marks.map((m) => (
              <g key={m.i} className={`goal-g${active >= m.from && active <= m.to ? ' on' : ''}`}>
                <circle className="goal-d" cx={x(m.i)} cy={plotB + 19} r="4" />
                <text className="goal-n" x={x(m.i)} y={plotB + 10} textAnchor="middle">
                  {m.count}
                </text>
              </g>
            ))}
          </g>
        )}
        {active >= 0 && (
          <>
            <line className="hair" x1={px} x2={px} y1={padT} y2={plotB} />
            {!bars && values[active] != null && <circle className="hdot" cx={px} cy={py} r="4.5" />}
          </>
        )}
        <rect className="hit" x={padL} y="0" width={Math.max(0, plotW)} height={H} />
      </svg>
      {cardOn && (
        <div ref={cardRef} className="ctip" data-testid="chart-card" data-side={place.side} aria-hidden="true" style={{ transform: `translate(${Math.round(place.left)}px, ${Math.round(cardTop)}px)` }}>
          {o.renderCard!(active)}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
    </figure>
  )
}
