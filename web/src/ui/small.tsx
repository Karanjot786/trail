// Kbd, Badge, Chip, StatusDot (plan §0.10).
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/** Keys separated by spaces render as separate caps: <Kbd>⌘ K</Kbd>. */
export function Kbd({ children }: { children: ReactNode }) {
  if (typeof children !== 'string' || !children.includes(' ') || children.trim().length < 2) return <kbd className="kbd">{children}</kbd>
  return (
    <span className="kbds">
      {children.split(' ').filter(Boolean).map((k, i) => (
        <kbd key={i} className="kbd">
          {k}
        </kbd>
      ))}
    </span>
  )
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'blue' | 'good' | 'warn' | 'bad' | 'goal' }) {
  return (
    <span className="badge" data-tone={tone}>
      {children}
    </span>
  )
}

export interface ChipProps {
  k?: string
  v: string
  onRemove?: () => void
}
export function Chip({ k, v, onRemove }: ChipProps) {
  return (
    <span className="chip" title={k ? `${k}: ${v}` : v}>
      {k && <span className="k">{k}</span>}
      <span className="v">{v}</span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${k ? `${k} ` : ''}${v}`} onClick={onRemove}>
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

export function StatusDot({ tone }: { tone: 'live' | 'ok' | 'warn' | 'off' }) {
  return <span aria-hidden="true" className="sdot" data-tone={tone} />
}
