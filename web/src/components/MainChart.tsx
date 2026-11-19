import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Metric, Series } from '@/api'
import { num, pct } from '@/format'
import { DAY, HOUR, fmtDateTime, fmtDay, fmtTime, fmtWeekday } from '@/time'

const BLUE = '#0a72ef'

interface Row {
  t: number
  v: number
  solid: number | null
  dash: number | null
}

export function MainChart({
  series,
  metric,
  onBucket,
}: {
  series?: Series
  metric: Metric
  onBucket?: (from: number, to: number) => void
}) {
  const bucketMs = series?.bucket === 'hour' ? HOUR : DAY
  const rows: Row[] = useMemo(() => {
    const pts = series?.points ?? []
    const last = pts[pts.length - 1]
    // The current bucket is still filling: draw its segment dashed from the previous point.
    const incomplete = pts.length >= 2 && last.t + bucketMs > Date.now()
    return pts.map((p, i) => ({
      t: p.t,
      v: p.v,
      solid: incomplete && i === pts.length - 1 ? null : p.v,
      dash: incomplete && i >= pts.length - 2 ? p.v : null,
    }))
  }, [series, bucketMs])

  const fmtV = (v: number) => (metric === 'bounce' ? pct(v) : num(v))
  const fmtX = (t: number) => (series?.bucket === 'hour' ? fmtTime(t) : fmtDay(t))

  return (
    <div className="h-[260px] px-1 pb-3 pt-6 sm:h-[400px] sm:px-4 sm:pb-5 sm:pt-8" aria-label={`${metric} over time`}>
      {series && (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: 24, bottom: 0, left: 0 }}
            onClick={(s) => {
              const i = Number(s?.activeTooltipIndex)
              const row = Number.isFinite(i) ? rows[i] : undefined
              if (row && onBucket) onBucket(row.t, row.t + bucketMs - 1)
            }}
            style={{ cursor: onBucket ? 'pointer' : undefined }}
          >
            <CartesianGrid vertical={false} stroke="#1f1f1f" />
            <XAxis
              dataKey="t"
              tickFormatter={fmtX}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#8f8f8f', fontSize: 13 }}
              tickMargin={14}
              minTickGap={28}
              interval="preserveStartEnd"
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              tickFormatter={fmtV}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#8f8f8f', fontSize: 13 }}
              width={48}
              tickMargin={8}
              allowDecimals={metric === 'bounce'}
              domain={metric === 'bounce' ? [0, 1] : [0, 'auto']}
            />
            <Tooltip
              cursor={{ stroke: '#3a3a3a', strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined
                if (!row) return null
                const label = series.bucket === 'hour' ? fmtDateTime(row.t) : `${fmtWeekday(row.t)}, ${fmtDay(row.t)}`
                return (
                  <div className="min-w-36 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-[0_8px_30px_rgb(0_0_0/0.6)]">
                    <div className="text-muted">{label}</div>
                    <div className="mt-1 flex items-center justify-between gap-4">
                      <span className="flex items-center gap-2 text-fg">
                        <span className="size-2 rounded-full" style={{ background: BLUE }} />
                        {metric === 'visitors' ? 'Visitors' : metric === 'pageviews' ? 'Page Views' : 'Bounce Rate'}
                      </span>
                      <span className="num font-medium text-fg">{fmtV(row.v)}</span>
                    </div>
                  </div>
                )
              }}
            />
            <Area type="linear" dataKey="v" stroke="none" fill={BLUE} fillOpacity={0.08} isAnimationActive={false} activeDot={false} />
            <Line
              type="linear"
              dataKey="solid"
              stroke={BLUE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: BLUE, stroke: '#000', strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="linear"
              dataKey="dash"
              stroke={BLUE}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, fill: BLUE, stroke: '#000', strokeWidth: 2 }}
              isAnimationActive={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
