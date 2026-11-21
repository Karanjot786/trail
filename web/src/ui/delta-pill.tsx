// STUB (P0). F1 owns this file (plan §0.10): keep the props, replace the body. Renders via compare + deltaLabel only.
import type { Basis } from '../api/types'
import { compare, deltaLabel, type DeltaKind } from '../lib/compare'

export interface DeltaPillProps {
  cur: number | null
  prev: number | null
  kind: DeltaKind
  goodWhen: 'up' | 'down' | 'flat'
  basis: Basis
  n?: number
}

export function DeltaPill({ cur, prev, kind, goodWhen, basis, n }: DeltaPillProps) {
  const d = compare(cur, prev, kind, goodWhen, n)
  const l = deltaLabel(d, basis)
  return (
    <span data-mode={d.mode} data-tone={d.tone} title={l.tip}>
      <span aria-hidden="true">{l.pill}</span>
      <span className="sr-only">{l.sr}</span>
    </span>
  )
}
