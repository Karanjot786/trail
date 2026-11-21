// The main chart (Task F2-3): the readout header, the line (or bars for revenue) with the previous period
// dashed, notes, the goal lane and the floating card. ONE baseline: every bucket is compared with the same
// bucket of the dashed series (series.prev[i]), never with the day before.
// A click (or the second tap) on a day zooms to it (range=d:…); on the hour view it filters to that hour.
import { useState } from 'react'
import type { Metric, Note, Series, Stats } from '../../api/types'
import { BarsChart } from '../../charts/BarsChart'
import { ChartCard, type ChartCardRow } from '../../charts/ChartCard'
import { LineChart } from '../../charts/LineChart'
import { bucketLabel, fmtHour } from '../../charts/labels'
import { noFloatingCard } from '../../charts/TimeChart'
import { bucketIndex } from '../../charts/geometry'
import { fmtDay, fmtInt, fmtPct, fmtShortDay } from '../../lib/format'
import { rangeLabel } from '../../shell/labels'
import { navigate, useUrlState } from '../../state/useUrlState'
import { DeltaPill } from '../../ui/delta-pill'
import { Skeleton } from '../../ui/states'
import { StaticDelta } from './KpiStrip'
import { chartKind, dayIso, fmtMetric, metricDefs, type MetricDef } from './metrics'
import { Readout } from './Readout'
import { useNotes, useSeries } from './useOverviewData'

// The range to go back to from a day zoom: the last range that was not a single day.
let lastWideRange = '30d'

export interface MainChartProps {
  stats: Stats
  metric: Metric
  metrics: Metric[] // the tiles shown; the card lists visitors, page views, sessions (+ revenue)
  currency: string
}

export function MainChart({ stats, metric, metrics, currency }: MainChartProps) {
  const s = useUrlState()
  if (!s.range.startsWith('d:') && s.range !== 'today' && s.range !== 'yesterday') lastWideRange = s.range
  const defs = metricDefs(stats)
  const def = defs[metric]
  const cardMetrics: Metric[] = [metric, ...(['visitors', 'pageviews', 'sessions', 'revenue'] as Metric[]).filter((m) => m !== metric && metrics.includes(m))]
  const main = useSeries(metric)
  const others = {
    visitors: useSeries('visitors', cardMetrics.includes('visitors')),
    pageviews: useSeries('pageviews', cardMetrics.includes('pageviews')),
    sessions: useSeries('sessions', cardMetrics.includes('sessions')),
    revenue: useSeries('revenue', cardMetrics.includes('revenue')),
  } as Partial<Record<Metric, { data: Series | undefined }>>
  const notes = useNotes()
  const [reading, setReading] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const series = main.data
  const w = series?.window ?? stats.window
  const basis = w.basis
  const compareOn = !basis.none && !!series?.prev?.length
  const conv = stats.conv
  const lane = conv && series?.extras ? series.extras.map((e) => ({ t: e.t, count: e.conversions })) : undefined
  const laneLabel = conv ? `${conv.name}s` : undefined
  const per = w.bucket
  const title = `${def.label} per ${per}`
  const isDay = s.range.startsWith('d:')

  const seriesOf = (m: Metric) => (m === metric ? series : others[m]?.data)
  const whenLabel = (i: number) => {
    const t = series!.points[i].t
    if (per === 'hour') return `${fmtDay(w.from, w.tz)} · ${fmtHour(t, w.tz)}${w.elapsed && i === w.lastBucket ? ' so far' : ''}`
    return `${fmtDay(t, w.tz)}${w.elapsed && i === w.lastBucket ? ' · today so far' : ''}`
  }
  const prevLabel = (i: number) => {
    const p = series?.prev?.[i]
    if (!p) return ''
    return per === 'hour' ? `${fmtHour(p.t, w.tz)} on ${fmtShortDay(p.t, w.tz)}` : fmtDay(p.t, w.tz)
  }
  const valueAt = (m: Metric, i: number) => seriesOf(m)?.points[i]?.v ?? null
  const prevAt = (m: Metric, i: number) => seriesOf(m)?.prev?.[i]?.v ?? null
  const noteAt = (i: number) => (series ? notes.find((n: Note) => bucketIndex(series.points, n.ts) === i) : undefined)
  const goalsAt = (i: number) => (conv ? (series?.extras?.[i]?.conversions ?? 0) : 0)
  const goalText = (n: number) => `${fmtInt(n)} ${conv?.name.toLowerCase() ?? 'goal'}${n === 1 ? '' : 's'}`

  const renderCard = (i: number) => {
    const rows: ChartCardRow[] = cardMetrics.map((m) => {
      const d = defs[m]
      const v = valueAt(m, i)
      return {
        key: m,
        label: d.label,
        value: fmtMetric(d, v, currency),
        color: m === metric ? d.color : undefined,
        prev: compareOn ? fmtMetric(d, prevAt(m, i), currency) : undefined,
        delta: compareOn ? <StaticDelta cur={v} prev={prevAt(m, i)} kind={d.kind} goodWhen={d.goodWhen} basis={basis} /> : undefined,
      }
    })
    const ex = series?.extras?.[i]
    const total = valueAt('visitors', i) ?? 0
    const refs = (ex?.topSources ?? []).slice(0, 3).map((r) => ({ key: r.key, label: r.key || 'Came directly', value: fmtInt(r.visitors), share: fmtPct(total ? r.visitors / total : 0) }))
    const g = goalsAt(i)
    return <ChartCard title={whenLabel(i)} vs={compareOn ? prevLabel(i) : undefined} rows={rows} refs={refs} note={noteAt(i)?.label} signups={g ? goalText(g) : undefined} />
  }
  const describe = (i: number) => {
    const parts = cardMetrics.map((m) => {
      const d = defs[m]
      const v = valueAt(m, i)
      return `${fmtMetric(d, v, currency)} ${d.label.toLowerCase()}${compareOn ? ` (${fmtMetric(d, prevAt(m, i), currency)} on ${prevLabel(i)})` : ''}`
    })
    const top = series?.extras?.[i]?.topSources?.[0]
    const note = noteAt(i)
    const g = goalsAt(i)
    return `${whenLabel(i)}: ${parts.join(', ')}${top ? `. Top referrer ${top.key || 'Came directly'}, ${top.visitors}` : ''}${note ? `. Note: ${note.label}` : ''}${g ? `. ${goalText(g)}` : ''}`
  }
  const onPick = (i: number) => {
    if (!series) return
    if (per === 'day') navigate({ range: `d:${dayIso(series.points[i].t, w.tz)}` })
    else {
      const rest = s.filters.filter((f) => f.dim !== 'hour')
      navigate({ filters: [...rest, { dim: 'hour', value: String(Number(fmtHour(series.points[i].t, w.tz).slice(0, 2))) }] })
    }
  }
  const onHover = (i: number | null) => setReading(i != null && noFloatingCard() ? i : null)

  const readoutReading =
    reading != null && series
      ? {
          when: whenLabel(reading),
          value: fmtMetric(def, valueAt(metric, reading), currency),
          unit: def.label.toLowerCase(),
          delta: compareOn ? <StaticDelta cur={valueAt(metric, reading)} prev={prevAt(metric, reading)} kind={def.kind} goodWhen={def.goodWhen} basis={basis} /> : null,
          vs: compareOn ? `vs ${fmtMetric(def, prevAt(metric, reading), currency)} · ${prevLabel(reading)}` : '',
          tops: (series.extras?.[reading]?.topSources ?? []).slice(0, 3).map((r) => ({ key: r.key || 'Came directly', n: r.visitors })),
          note: noteAt(reading)?.label,
          goals: goalsAt(reading) ? goalText(goalsAt(reading)) : undefined,
        }
      : null

  const ariaLabel = title
  const chartProps = { window: w, height: 300, ariaLabel, onHover, onPick, renderCard, describe }

  return (
    <div className="chart-card">
      <Readout
        title={`${title} · ${w.label === 'Today' || w.label === 'Yesterday' ? fmtDay(w.from, w.tz) : rangeDates(w.from, w.to, w.tz, per)}`}
        dashed={compareOn ? `Dashed: ${basis.dates} (${basis.short})` : ''}
        reading={readoutReading}
        hint={per === 'day' ? 'Point at a day, or use arrow keys, to read it. Click to zoom in.' : 'Point at an hour to read it. Click to filter to it.'}
        back={isDay ? { label: `Back to ${rangeLabel(lastWideRange as never)[0]}`, onClick: () => navigate({ range: lastWideRange as never }) } : null}
        legend={{
          color: def.color,
          current: rangeDates(w.from, w.to, w.tz, per),
          prev: compareOn ? (basis.custom ? `Compared: ${basis.dates}` : basis.dates) : null,
          today: w.elapsed,
          notes: notes.length > 0,
          goal: lane?.some((l) => l.count > 0) ? `${laneLabel} (count above)` : null,
        }}
        table={table}
        onTable={() => setTable(!table)}
      />
      {!series ? (
        <div aria-busy="true">
          <Skeleton height={300} />
        </div>
      ) : metric === 'revenue' ? (
        <BarsChart points={series.points} prev={compareOn ? series.prev : undefined} color={def.color} money={currency} {...chartProps} />
      ) : (
        <LineChart points={series.points} prev={compareOn ? series.prev : undefined} color={def.color} kind={chartKind(metric)} notes={notes} lane={lane} laneLabel={laneLabel} {...chartProps} />
      )}
      {table && series && <ChartTable series={series} def={def} currency={currency} compareOn={compareOn} prevLabel={prevLabel} notes={notes} />}
    </div>
  )
}

function rangeDates(from: number, to: number, tz: string, per: 'hour' | 'day'): string {
  if (per === 'hour') return fmtShortDay(from, tz)
  const a = fmtShortDay(from, tz)
  const b = fmtShortDay(to, tz)
  return a === b ? a : `${a} – ${b}`
}

function ChartTable({ series, def, currency, compareOn, prevLabel, notes }: { series: Series; def: MetricDef; currency: string; compareOn: boolean; prevLabel: (i: number) => string; notes: Note[] }) {
  const w = series.window
  return (
    <div className="chart-table">
      <table>
        <caption className="sr-only">
          {def.label} by {w.bucket}
        </caption>
        <thead>
          <tr>
            <th scope="col">{w.bucket === 'hour' ? 'Hour' : 'Day'}</th>
            <th scope="col" className="r">
              {def.label}
            </th>
            {compareOn && (
              <>
                <th scope="col">Previous period</th>
                <th scope="col" className="r">
                  Then
                </th>
                <th scope="col" className="r">
                  Change
                </th>
              </>
            )}
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {series.points.map((p, i) =>
            p.v == null ? null : (
              <tr key={p.t}>
                <td>{bucketLabel(p.t, w)}</td>
                <td className="r">{fmtMetric(def, p.v, currency)}</td>
                {compareOn && (
                  <>
                    <td>{prevLabel(i)}</td>
                    <td className="r">{fmtMetric(def, series.prev[i]?.v ?? null, currency)}</td>
                    <td className="r">
                      <DeltaPill cur={p.v} prev={series.prev[i]?.v ?? null} kind={def.kind} goodWhen={def.goodWhen} basis={w.basis} />
                    </td>
                  </>
                )}
                <td>{notes.find((n) => bucketIndex(series.points, n.ts) === i)?.label ?? ''}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
