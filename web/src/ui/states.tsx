// Skeleton, EmptyState, ErrorState (plan §0.10). Empty states teach; errors offer a retry.
import type { ReactNode } from 'react'
import { Button } from './button'

export function Skeleton({ height = 16, width }: { height?: number; width?: number | string }) {
  return <div aria-hidden="true" className="sk" style={{ height, width }} />
}

export interface EmptyStateProps {
  title: string
  body?: ReactNode
  action?: ReactNode
  numeral?: string | number
}
export function EmptyState({ title, body, action, numeral }: EmptyStateProps) {
  return (
    <div className="empty">
      {numeral != null && (
        <div className="numeral" aria-hidden="true">
          {numeral}
        </div>
      )}
      <b>{title}</b>
      {body && <p>{body}</p>}
      {action && <div className="acts">{action}</div>}
      <div className="plane" aria-hidden="true" />
    </div>
  )
}

export function ErrorState({ onRetry, message = 'Could not load this.' }: { onRetry: () => void; message?: string }) {
  return (
    <div className="empty" role="alert">
      <b>{message}</b>
      <p>The last numbers stay on screen. Trail tries again by itself.</p>
      <div className="acts">
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  )
}
