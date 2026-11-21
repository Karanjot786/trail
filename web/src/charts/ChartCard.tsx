// The floating chart card's content (design-system chart-card.md). Only the plotted series gets a colour key;
// other metrics are plain rows. The date, then "vs {comparison day}" with the dashed swatch, metric rows with
// their deltas, the top 3 referrers with an initial tile, and the note and signups in a footer.
import type { ReactNode } from 'react'

export interface ChartCardRow {
  key: string
  label: string
  value: string
  /** The series colour: pass it only for the plotted series. */
  color?: string
  delta?: ReactNode
}
export interface ChartCardRef {
  key: string
  label: string
  value: string
  share: string
}
export interface ChartCardProps {
  title: string
  /** "Oct 13": the matching bucket of the dashed series. */
  vs?: string
  rows: ChartCardRow[]
  refs?: ChartCardRef[]
  note?: string
  signups?: string
}

export function ChartCard({ title, vs, rows, refs, note, signups }: ChartCardProps) {
  return (
    <>
      <div className="tt-d">
        <span>{title}</span>
        {vs && (
          <span className="tt-vs">
            vs {vs} <span className="sw-prev" aria-hidden="true" /> dashed line
          </span>
        )}
      </div>
      {rows.map((r) => (
        <div key={r.key} className={`tt-r ${r.color ? 'on' : 'plain'}`}>
          {r.color ? <span className="tt-dot" style={{ background: r.color }} /> : <span />}
          <span className="tt-l">{r.label}</span>
          <b className="tt-v">{r.value}</b>
          <span className="tt-pv">{r.delta}</span>
        </div>
      ))}
      {refs && refs.length > 0 && (
        <>
          <div className="tt-h">Top referrers</div>
          {refs.slice(0, 3).map((r) => (
            <div key={r.key} className="tt-ref">
              <span className="tt-ini">{(r.label.trim()[0] ?? '?').toUpperCase()}</span>
              <span className="tt-l">{r.label}</span>
              <b className="tt-v">{r.value}</b>
              <span className="tt-sh">{r.share}</span>
            </div>
          ))}
        </>
      )}
      {(note || signups) && (
        <div className="tt-f">
          {note && (
            <span className="tt-note">
              <span className="sw-note" />
              {note}
            </span>
          )}
          {signups && (
            <span className="tt-goal">
              <span className="sw-goal" />
              {signups}
            </span>
          )}
        </div>
      )}
    </>
  )
}
