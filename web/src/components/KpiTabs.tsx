import type { Metric, Stats } from '@/api'
import { badgeTone, change, delta, num, pct } from '@/format'
import { useTween } from '@/useTween'
import { cn } from '@/lib/utils'

const TABS: { metric: Metric; label: string }[] = [
  { metric: 'visitors', label: 'Visitors' },
  { metric: 'pageviews', label: 'Page Views' },
  { metric: 'bounce', label: 'Bounce Rate' },
]

export function KpiTabs({ stats, metric, onChange }: { stats?: Stats; metric: Metric; onChange: (m: Metric) => void }) {
  const active = TABS.findIndex((t) => t.metric === metric)
  return (
    <div className="flex border-b border-border">
      <div role="tablist" aria-label="Metric" className="relative grid flex-1 grid-cols-3 lg:max-w-[57.5%] lg:flex-none lg:basis-[57.5%]">
        {TABS.map((t, i) => (
          <KpiTab
            key={t.metric}
            label={t.label}
            metric={t.metric}
            stats={stats}
            selected={i === active}
            onSelect={() => onChange(t.metric)}
            last={i === TABS.length - 1}
          />
        ))}
        <span
          aria-hidden
          className="slider pointer-events-none absolute bottom-[-1px] left-0 h-0.5 w-1/3 bg-white"
          style={{ transform: `translateX(${active * 100}%)` }}
        />
      </div>
      <div className="hidden flex-1 border-l border-border bg-raised lg:block" aria-hidden />
    </div>
  )
}

function KpiTab({
  label,
  metric,
  stats,
  selected,
  onSelect,
  last,
}: {
  label: string
  metric: Metric
  stats?: Stats
  selected: boolean
  onSelect: () => void
  last: boolean
}) {
  const value = stats ? stats[metric] : 0
  const prev = stats ? stats.prev[metric] : 0
  const shown = useTween(value)
  const ch = change(value, prev)
  const tone = badgeTone(metric, ch)
  const text = metric === 'bounce' ? pct(shown) : num(shown)
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'group flex min-w-0 flex-col items-start gap-2 px-4 pb-5 pt-4 text-left outline-none transition-colors duration-150 focus-visible:bg-hover sm:gap-3 sm:px-6 sm:pb-7 sm:pt-6',
        !last && 'border-r border-border',
        selected ? 'bg-card' : 'bg-black hover:bg-[#070707]',
      )}
    >
      <span className={cn('truncate text-sm font-medium sm:text-base', selected ? 'text-fg' : 'text-muted')}>{label}</span>
      <span className="flex min-w-0 flex-wrap items-center lg:flex-nowrap gap-x-4 gap-y-1.5">
        <span className="num text-[28px] font-semibold leading-none tracking-[-0.03em] text-fg sm:text-[44px]">
          {stats ? text : <span className="inline-block h-[1em] w-14 rounded-md bg-raised align-middle" />}
        </span>
        {stats && (
          <span
            className={cn(
              'num rounded-md px-1.5 py-0.5 text-xs font-medium sm:px-2 sm:py-1 sm:text-[13px]',
              tone === 'good' && 'bg-good-bg text-good',
              tone === 'bad' && 'bg-bad-bg text-bad',
              tone === 'neutral' && 'bg-raised text-muted',
            )}
            title={`vs previous period (${metric === 'bounce' ? pct(prev) : num(prev)})`}
          >
            {delta(value, prev)}
          </span>
        )}
      </span>
    </button>
  )
}
