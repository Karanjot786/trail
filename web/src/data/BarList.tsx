// The ranked bar list (design-system bar-list-row.md). One CSS grid with subgrid rows: the label column hugs
// the longest label up to half the width, a 6px bar leads to the numbers, and every bar is
// bar(value, max(value in this list)) drawn with transform: scaleX(). Under 460px of panel width the bar drops.
// The row's label button opens its report; a separate Filter button filters the page (absent without onFilter,
// e.g. in share mode). Zero renders 0, never a dash; null renders n/a with its reason.
import type { Dim, Row } from '../api/types'
import { bar } from '../lib/bar'
import type { DeltaKind } from '../lib/compare'
import { cellText, MONO_DIMS } from './columns'
import './data.css'

export interface BarRowModel {
  key: string
  label: string
  value: number // the bar's value: bar(value, max(value in this list))
  dim: Dim
  row: Row
  /** F2 addition: visitors / all visitors in the range (the % of total column); null when unknown. */
  share?: number | null
}
export interface ColumnDef {
  id: string
  header: string
  value: (row: BarRowModel) => number | string | null
  kind?: DeltaKind
  definition?: string
  hideable?: boolean
  /** F2 additions (optional). */
  format?: (v: number, row?: BarRowModel) => string
  muted?: boolean
  naReason?: string
  srSuffix?: (row: BarRowModel) => string
}
export interface BarListProps {
  rows: BarRowModel[]
  columns: ColumnDef[]
  onOpen?: (row: BarRowModel) => void
  onFilter?: (row: BarRowModel) => void
  overlapNote?: string
  /** F2 addition: rows whose filter is on (pressed Filter button, accent row). */
  isActive?: (row: BarRowModel) => boolean
  /** F2 addition: the first column head (the dimension's name). */
  labelHeader?: string
}

export function BarList({ rows, columns, onOpen, onFilter, overlapNote, isActive, labelHeader }: BarListProps) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  const filters = !!onFilter
  return (
    <div className="bl-wrap">
      <div className="bl" style={{ ['--nc' as string]: columns.length }} data-filters={filters || undefined}>
        <div className="bl-head" aria-hidden="true">
          <span>{labelHeader ?? ''}</span>
          <span className="bl-bh" />
          {columns.map((c) => (
            <span key={c.id} className="c" title={c.definition}>
              {c.header}
            </span>
          ))}
          {filters && <span />}
        </div>
        <ul className="bl-rows">
          {rows.map((r) => {
            const active = !!isActive?.(r)
            const f = bar(r.value, max)
            return (
              <li key={r.key} className={`bl-row${active ? ' active' : ''}`}>
                <button type="button" className={`bl-open${MONO_DIMS.has(r.dim) ? ' mono' : ''}`} title={r.label} onClick={() => onOpen?.(r)}>
                  <span className="name">{r.label}</span>
                </button>
                <span className="bl-bar" aria-hidden="true">
                  <i data-testid="bar" style={{ transform: `scaleX(${Number(f.toFixed(4))})` }} />
                </span>
                {columns.map((c) => {
                  const v = c.value(r)
                  const text = cellText(c, r)
                  return (
                    <span key={c.id} className={`c${c.muted ? ' dim' : ''}`} title={v == null ? `Not available: ${c.naReason ?? 'does not apply here'}` : undefined}>
                      {text}
                      <span className="sr-only">
                        {' '}
                        {c.header.toLowerCase()}
                        {v == null && c.naReason ? ` (${c.naReason})` : ''}
                        {c.srSuffix?.(r) ?? ''}
                      </span>
                    </span>
                  )
                })}
                {filters && (
                  <button type="button" className="bl-filter" aria-pressed={active} aria-label={`Filter by ${r.label}`} onClick={() => onFilter!(r)}>
                    <FilterIcon off={active} />
                    <span className="fl" aria-hidden="true">
                      {active ? 'Remove' : 'Filter'}
                    </span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      {overlapNote && (
        <p className="bl-note" data-testid="overlap-note">
          {overlapNote}
        </p>
      )}
    </div>
  )
}

function FilterIcon({ off }: { off: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 5h18l-7 8v6l-4 2v-8z" />}
    </svg>
  )
}
