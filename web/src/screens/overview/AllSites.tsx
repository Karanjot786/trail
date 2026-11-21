// All websites (site=all, Task F2-5): the terrain band (visitors per day across every site, drawn as dots)
// and a calm grid of site cards, each with its sparkline. A card opens that site's Overview.
import { ChevronRight, Globe } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { api } from '../../api/client'
import type { SiteSummary } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import { Sparkline } from '../../charts/Sparkline'
import { fmtInt, fmtPct } from '../../lib/format'
import { useStats } from '../../shell/useStats'
import { navigate } from '../../state/useUrlState'
import { DeltaPill } from '../../ui/delta-pill'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { useApiQuery } from './useOverviewData'

/** Element-wise sum of the sites' sparklines (null where every site is null). */
export function sumSparks(sites: SiteSummary[]): (number | null)[] {
  const n = Math.max(0, ...sites.map((s) => s.spark.length))
  return Array.from({ length: n }, (_, i) => {
    let any = false
    let t = 0
    for (const s of sites) {
      const v = s.spark[i]
      if (v != null) {
        any = true
        t += v
      }
    }
    return any ? t : null
  })
}

function Terrain({ values }: { values: (number | null)[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext?.('2d')
    if (!c || !ctx) return
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const r = c.getBoundingClientRect()
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      const vals = values.map((v) => v ?? 0)
      if (!vals.length) return
      const w = c.width
      const h = c.height
      const pitch = 8 * dpr
      const cols = Math.floor(w / pitch)
      const rows = Math.floor(h / pitch)
      const max = Math.max(1, ...vals)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = getComputedStyle(c).color
      for (let col = 0; col < cols; col++) {
        const f = (col / Math.max(1, cols - 1)) * (vals.length - 1)
        const i0 = Math.floor(f)
        const t = f - i0
        const v = vals[i0] * (1 - t) + (vals[Math.min(vals.length - 1, i0 + 1)] ?? 0) * t
        const top = Math.round((v / max) * (rows - 1) * 0.92) + 1
        for (let rr = 0; rr < top; rr++) {
          ctx.globalAlpha = rr === top - 1 ? 1 : 0.18 + 0.5 * (rr / top)
          ctx.beginPath()
          ctx.arc(col * pitch + pitch / 2, h - rr * pitch - pitch / 2, (rr === top - 1 ? 1.7 : 1.25) * dpr, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }
    draw()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null
    ro?.observe(c)
    return () => ro?.disconnect()
  }, [values])
  return <canvas ref={ref} className="terrain" role="img" aria-label="Visitors per day across all websites" />
}

export function AllSites() {
  const { q, key } = useApiQuery()
  const stats = useStats()
  const r = useQuery<SiteSummary[]>(`sites-summary|${key}`, async (sig) => api.sitesSummary(q, sig))
  const basis = stats.data?.window.basis
  if (r.error && !r.data) return <ErrorState onRetry={r.refetch} />
  if (!r.data)
    return (
      <div aria-busy="true" className="all-sites">
        <Skeleton height={220} />
        <Skeleton height={200} />
      </div>
    )
  const sites = r.data
  if (!sites.length) return <EmptyState title="No websites yet" body="Add a website in Settings to start counting visits." />
  const total = sites.reduce((a, s) => a + s.visitors, 0)
  const prevAll = sites.every((s) => s.prevVisitors == null) ? null : sites.reduce((a, s) => a + (s.prevVisitors ?? 0), 0)
  const online = sites.reduce((a, s) => a + s.online, 0)
  const cmp = basis && !basis.none
  return (
    <div className="all-sites">
      <div className="terrain-band">
        <div className="kp">
          <div>
            <div className="k">Visitors</div>
            <div className="v">{fmtInt(total)}</div>
            {cmp && basis && (
              <span className="band-d">
                <DeltaPill cur={total} prev={prevAll} kind="count" goodWhen="up" basis={basis} />
              </span>
            )}
          </div>
          <div>
            <div className="k">Online now</div>
            <div className="v">{fmtInt(online)}</div>
          </div>
          <div>
            <div className="k">Websites</div>
            <div className="v">{fmtInt(sites.length)}</div>
          </div>
        </div>
        <p className="cap">Visitors per day across all sites. Each column of dots is one day of footsteps.</p>
        <Terrain values={sumSparks(sites)} />
      </div>
      <div className="sec-h">
        <h2>
          Websites <span className="muted num">{sites.length}</span>
        </h2>
        {cmp && basis && <p className="muted">Changes are {basis.text}. Open one to see its overview.</p>}
      </div>
      <ul className="site-cards">
        {sites.map((s) => (
          <li key={s.id}>
            <button type="button" className="scard" onClick={() => navigate({ site: s.id, filters: [], sheet: null })}>
              <span className="h">
                <span className="ic">
                  <Globe size={16} aria-hidden="true" />
                </span>
                <span className="who">
                  <b>{s.domain}</b>
                  <span>{fmtInt(s.online)} online</span>
                </span>
                <ChevronRight className="chev" size={16} aria-hidden="true" />
              </span>
              <span className="m">
                <span>
                  <span className="v">{fmtInt(s.visitors)}</span>
                  <span className="s">Visitors · {fmtPct(total ? s.visitors / total : 0)} of total</span>
                </span>
              </span>
              <Sparkline values={s.spark} width={300} height={56} area className="spk" />
            </button>
            {cmp && basis && (
              <span className="scard-delta">
                <DeltaPill cur={s.visitors} prev={s.prevVisitors} kind="count" goodWhen="up" basis={basis} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
