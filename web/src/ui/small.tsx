// STUB (P0). F1 owns this file (plan §0.10): keep the props, replace the body.
import type { ReactNode } from 'react'

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>
}

export function Badge({ children }: { children: ReactNode }) {
  return <span>{children}</span>
}

export interface ChipProps {
  k?: string
  v: string
  onRemove?: () => void
}
export function Chip({ k, v, onRemove }: ChipProps) {
  return (
    <span>
      {k ? `${k}: ` : ''}
      {v}
      {onRemove && (
        <button type="button" aria-label={`Remove ${k ? `${k} ` : ''}${v}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  )
}

export function StatusDot({ tone }: { tone: 'live' | 'ok' | 'warn' | 'off' }) {
  return <span aria-hidden="true" data-tone={tone} />
}
