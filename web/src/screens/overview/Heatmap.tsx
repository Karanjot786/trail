// The activity heatmap (Task F2-4): visitors by weekday and hour over the last 4 full weeks. It ignores its own
// weekday/hour filters (they would collapse it to one cell) and outlines the chosen cell instead. Enter or a
// click adds both filters. Sparse data shows "Not enough data yet" with the count so far. A single hour is
// named only when it clearly wins (`clear`); otherwise the busiest part of the week is named.
import { Clock } from 'lucide-react'
import { api } from '../../api/client'
import type { Heatmap as HeatmapData } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import { HeatmapGrid, HeatmapLegend, WEEKDAYS } from '../../charts/HeatmapGrid'
import { fmtInt } from '../../lib/format'
import { tzCity, viewerTz } from '../../shell/labels'
import { navigate, useUrlState } from '../../state/useUrlState'
import { ErrorState, Skeleton } from '../../ui/states'
import { useApiQuery } from './useOverviewData'

const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`
/** "Tuesdays, 20:00–21:00": the clear peak, named by the UI (the API sends busiest only when no hour wins). */
export function peakLabel(p: { dow: number; hour: number }): string {
  return `${WEEKDAYS[p.dow]}s, ${hh(p.hour)}–${hh(p.hour + 1)}`
}

export function Heatmap() {
  const s = useUrlState()
  const { q, key } = useApiQuery()
  const hq = new URLSearchParams(q)
  hq.delete('f')
  for (const f of s.filters) if (f.dim !== 'dow' && f.dim !== 'hour') hq.append('f', `${f.dim}:${f.value}`)
  const r = useQuery<HeatmapData>(`heatmap|${hq}|${key.split('|').pop()}`, async (sig) => api.heatmap(hq, sig), { enabled: !!s.site && s.site !== 'all' })
  const dow = s.filters.find((f) => f.dim === 'dow')?.value
  const hour = s.filters.find((f) => f.dim === 'hour')?.value
  const selected = dow != null && hour != null ? { dow: Number(dow), hour: Number(hour) } : null
  const pick = (d: number, h: number) => {
    const rest = s.filters.filter((f) => f.dim !== 'dow' && f.dim !== 'hour')
    navigate({ filters: [...rest, { dim: 'dow', value: String(d) }, { dim: 'hour', value: String(h) }] })
  }
  const hm = r.data
  return (
    <section className="panel heat-panel" aria-labelledby="heat-h">
      <div className="panel-h">
        <h2 id="heat-h">When people visit</h2>
        <span className="muted heat-sub">Last 4 full weeks · {tzCity(viewerTz())} time</span>
      </div>
      <div className="heat">
        {r.error && !hm ? (
          <ErrorState onRetry={r.refetch} />
        ) : !hm ? (
          <div aria-busy="true">
            <Skeleton height={220} />
          </div>
        ) : hm.status === 'sparse' ? (
          <div className="heat-empty">
            <span className="dotnum" aria-hidden="true">
              {fmtInt(hm.total)}
              <i>/{hm.threshold}</i>
            </span>
            <b>Not enough data yet</b>
            <p>
              The weekly pattern needs about {hm.threshold} visitor-hours over 4 weeks before it means anything. {s.filters.length ? 'These filters have' : 'This site has'}{' '}
              {fmtInt(hm.total)} so far.
            </p>
          </div>
        ) : (
          <>
            {hm.clear && hm.peak ? (
              <div className="heat-callout" data-clear="1">
                <Clock size={16} aria-hidden="true" />
                <span>
                  Busiest hour: <b>{peakLabel(hm.peak)}</b>.
                </span>
              </div>
            ) : (
              hm.busiest && (
                <div className="heat-callout" data-clear="0">
                  <Clock size={16} aria-hidden="true" />
                  <span>
                    <b>{hm.busiest.label}.</b> No single hour stands out.
                  </span>
                </div>
              )
            )}
            <HeatmapGrid cells={hm.cells} max={hm.max} peak={hm.peak} clear={hm.clear} selected={selected} onPick={pick} />
            <div className="heat-foot">
              <HeatmapLegend max={hm.max} />
              <span className="subtle">average visitors per hour, linear from 0; an outlined cell is 0</span>
            </div>
            <p className="method">
              Each visitor counts once per date and hour; a cell is the average over 4 weeks, empty hours included. Colour is linear from 0 to the top cell. Click a
              cell, or press Enter on it, to filter to that weekday and hour.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
