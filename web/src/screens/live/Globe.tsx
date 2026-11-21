// The Live dot globe (port of proto-d charts.js globe): land as muted dots, active countries as brand-blue
// dots sized by count with a code chip. One canvas, no library. It spins slowly unless the viewer prefers
// reduced motion, the page is frozen (offline or paused) or the tab is hidden; Pause and the rotate buttons
// work either way. Country-level positions only.
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { Button } from '../../ui/button'
import { CENTROIDS, LAND } from './land'

export interface GlobePoint {
  code: string
  n: number
}

let landPts: [number, number][] | null = null
function land(): [number, number][] {
  if (landPts) return landPts
  const pts: [number, number][] = []
  LAND.rows.forEach((row, ri) => {
    const lat = LAND.lat0 - ri * LAND.step
    for (let c = 0; c < row.length; c++) {
      const nib = parseInt(row[c], 16)
      for (let b = 0; b < 4; b++) if (nib & (8 >> b)) pts.push([(lat * Math.PI) / 180, ((LAND.lon0 + (c * 4 + b) * LAND.step) * Math.PI) / 180])
    }
  })
  landPts = pts
  return pts
}

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function Globe({ points, frozen }: { points: GlobePoint[]; frozen: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const rot = useRef(-78)
  const pts = useRef(points)
  pts.current = points
  const [userPaused, setUserPaused] = useState(reduceMotion)
  const spinning = !userPaused && !frozen
  const drawRef = useRef<() => void>(() => {})

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext?.('2d')
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const tilt = (-18 * Math.PI) / 180
    const size = () => {
      const r = c.getBoundingClientRect()
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
    }
    const draw = () => {
      const css = getComputedStyle(document.documentElement)
      const col = (n: string) => css.getPropertyValue(n).trim()
      const w = c.width
      const h = c.height
      if (!w || !h) return
      const narrow = w / dpr < 520
      const R = narrow ? Math.min(w * 0.36, h * 0.38) : Math.min(w * 0.42, h * 0.44)
      const cx = w * (narrow ? 0.62 : 0.6)
      const cy = h * (narrow ? 0.58 : 0.54)
      ctx.clearRect(0, 0, w, h)
      const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R)
      g.addColorStop(0, col('--raised') || col('--surface'))
      g.addColorStop(1, col('--bg'))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = col('--border')
      ctx.lineWidth = dpr
      ctx.stroke()
      const lam = (rot.current * Math.PI) / 180
      const ct = Math.cos(tilt)
      const st = Math.sin(tilt)
      const project = (phi: number, l: number) => {
        const x = Math.cos(phi) * Math.sin(l)
        const y0 = Math.sin(phi)
        const z0 = Math.cos(phi) * Math.cos(l)
        return { x, y: y0 * ct - z0 * st, z: y0 * st + z0 * ct }
      }
      ctx.fillStyle = col('--muted')
      for (const [phi, lon] of land()) {
        const p = project(phi, lon + lam)
        if (p.z <= 0) continue
        ctx.globalAlpha = 0.18 + 0.62 * p.z
        ctx.beginPath()
        ctx.arc(cx + p.x * R, cy - p.y * R, (0.9 + 0.5 * p.z) * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      const blue = col('--brand') || col('--accent')
      ctx.font = `500 ${11.5 * dpr}px ${col('--font-sans') || 'system-ui, sans-serif'}`
      for (const pt of pts.current) {
        const ll = CENTROIDS[pt.code]
        if (!ll) continue
        const p = project((ll[0] * Math.PI) / 180, (ll[1] * Math.PI) / 180 + lam)
        if (p.z <= 0.05) continue
        const px = cx + p.x * R
        const py = cy - p.y * R
        const r = (4 + 2.2 * Math.sqrt(pt.n)) * dpr
        ctx.fillStyle = blue
        ctx.globalAlpha = 0.25 * p.z
        ctx.beginPath()
        ctx.arc(px, py, r * 2.1, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = col('--surface')
        ctx.lineWidth = 2 * dpr
        ctx.stroke()
        const label = `${pt.code} ${pt.n}`
        const tw = ctx.measureText(label).width
        const bx = px + r + 6 * dpr
        const by = py - 10 * dpr
        ctx.globalAlpha = Math.min(1, p.z * 1.4)
        ctx.fillStyle = col('--raised') || col('--surface')
        ctx.strokeStyle = col('--border-strong')
        ctx.lineWidth = dpr
        ctx.beginPath()
        ctx.roundRect?.(bx, by, tw + 12 * dpr, 20 * dpr, 6 * dpr)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = col('--fg')
        ctx.fillText(label, bx + 6 * dpr, by + 14 * dpr)
        ctx.globalAlpha = 1
      }
    }
    drawRef.current = draw
    size()
    draw()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => (size(), draw())) : null
    ro?.observe(c)
    // Theme switches change the tokens: redraw.
    const mo = new MutationObserver(draw)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    return () => {
      ro?.disconnect()
      mo.disconnect()
    }
  }, [])

  // Redraw when the active countries change.
  useEffect(() => drawRef.current(), [points])

  // The spin: requestAnimationFrame only while spinning and visible.
  useEffect(() => {
    if (!spinning) return
    let raf = 0
    let last = 0
    const loop = (ts: number) => {
      if (!document.hidden) {
        if (last) rot.current += (ts - last) * 0.006
        last = ts
        drawRef.current()
      } else last = 0
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [spinning])

  const nudge = (deg: number) => {
    rot.current += deg
    drawRef.current()
  }
  const active = points.filter((p) => CENTROIDS[p.code])
  return (
    <>
      <canvas
        ref={canvas}
        className="globe"
        role="img"
        aria-label={active.length ? `Dot globe with ${active.length} ${active.length === 1 ? 'country' : 'countries'} active: ${active.map((p) => `${p.code} ${p.n}`).join(', ')}` : 'Dot globe, nobody active right now'}
      />
      <div className="globe-ctrl">
        <Button size="sm" aria-label="Rotate west" onClick={() => nudge(30)}>
          <ChevronLeft size={14} aria-hidden="true" />
        </Button>
        <Button size="sm" aria-pressed={!spinning} disabled={frozen} onClick={() => setUserPaused((v) => !v)}>
          {spinning ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          {spinning ? 'Pause globe' : 'Spin globe'}
        </Button>
        <Button size="sm" aria-label="Rotate east" onClick={() => nudge(-30)}>
          <ChevronRight size={14} aria-hidden="true" />
        </Button>
        <span className="spacer" />
        <span className="globe-note">Country-level locations, not precise positions.</span>
      </div>
    </>
  )
}
