// DeltaPill (plan §0.10): renders through compare + deltaLabel only. Arrow + sign + colour, never colour alone.
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Basis } from '../api/types'
import { compare, deltaLabel, type DeltaKind } from '../lib/compare'
import { Tooltip } from './tooltip'

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
  const Arrow = d.up == null ? null : d.up ? ArrowUp : ArrowDown
  const pill = (
    <span className="delta" data-mode={d.mode} data-tone={d.tone} tabIndex={l.tip ? 0 : undefined}>
      {Arrow && <Arrow aria-hidden="true" />}
      <span aria-hidden="true">{l.pill}</span>
      <span className="sr-only">{l.sr}</span>
    </span>
  )
  return l.tip ? <Tooltip content={l.tip}>{pill}</Tooltip> : pill
}
