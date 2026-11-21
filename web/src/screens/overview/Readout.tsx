// The chart header. Idle, it names the chart and the dashed period; while a bucket is read on touch or a
// narrow screen it is the tooltip (date, value, change vs the dashed bucket, top sources, note, goals).
import { ChevronLeft, MousePointer2, Table2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { noFloatingCard } from '../../charts/TimeChart'
import { Button } from '../../ui/button'

export interface ReadoutReading {
  when: string
  value: string
  unit: string
  delta: ReactNode
  vs: string
  tops: { key: string; n: number }[]
  note?: string
  goals?: string
}
export interface ReadoutProps {
  title: string
  dashed: string
  reading: ReadoutReading | null
  hint: string
  back: { label: string; onClick: () => void } | null
  legend: { color: string; current: string; prev: string | null; today: boolean; notes: boolean; goal: string | null }
  table: boolean
  onTable: () => void
}

export function Readout({ title, dashed, reading, hint, back, legend, table, onTable }: ReadoutProps) {
  const touch = noFloatingCard()
  return (
    <div className="readout" data-testid="chart-readout">
      {reading ? (
        <>
          <div className="big">
            <span className="when">{reading.when}</span>
            <span className="v">
              {reading.value} <span className="pv">{reading.unit}</span> {reading.delta}
              {reading.vs && <span className="pv">{reading.vs}</span>}
            </span>
          </div>
          <span className="tops">
            {reading.note && <span className="chip-s">{reading.note}</span>}
            {reading.tops.length ? (
              reading.tops.map((t) => (
                <span key={t.key} className="chip-s">
                  {t.key} <b>{t.n}</b>
                </span>
              ))
            ) : (
              <span>No visits</span>
            )}
            {reading.goals && (
              <span className="chip-s">
                <span className="sw-goal" aria-hidden="true" /> {reading.goals}
              </span>
            )}
          </span>
        </>
      ) : (
        <>
          <div className="big">
            <h2 className="chart-title">{title}</h2>
            {dashed && <span className="pv">{dashed}</span>}
          </div>
          <span className="tops">
            <MousePointer2 size={14} aria-hidden="true" />
            {touch ? (hint.includes('day') ? 'Tap a day to read it, tap again to zoom in.' : 'Tap an hour to read it.') : hint}
          </span>
        </>
      )}
      <span className="spacer" />
      {back && (
        <Button size="sm" onClick={back.onClick}>
          <ChevronLeft size={14} aria-hidden="true" />
          {back.label}
        </Button>
      )}
      <div className="legend" data-testid="chart-legend" aria-hidden="true">
        <span className="k">
          <span className="sw" style={{ background: legend.color }} />
          {legend.current}
        </span>
        {legend.prev && (
          <span className="k">
            <span className="sw-prev" />
            {legend.prev}
          </span>
        )}
        {legend.today && (
          <span className="k">
            <span className="sw sw-part" style={{ color: legend.color }} />
            Today so far
          </span>
        )}
        {legend.notes && (
          <span className="k">
            <span className="sw-note" />
            Note
          </span>
        )}
        {legend.goal && (
          <span className="k">
            <span className="sw-goal" />
            {legend.goal}
          </span>
        )}
      </div>
      <Button size="sm" variant="ghost" aria-pressed={table} aria-label="Show as a table" onClick={onTable}>
        <Table2 size={14} aria-hidden="true" />
        <span className="lbl-hide">Table</span>
      </Button>
    </div>
  )
}
