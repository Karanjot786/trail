// STUB (P0). F1 owns this file (plan §0.10): keep the props, replace the body.
import type { ReactNode } from 'react'

export function Skeleton({ height = 16 }: { height?: number }) {
  return <div aria-hidden="true" style={{ height }} />
}

export interface EmptyStateProps {
  title: string
  body?: ReactNode
  action?: ReactNode
  numeral?: string | number
}
export function EmptyState({ title, body, action, numeral }: EmptyStateProps) {
  return (
    <div>
      {numeral != null && <div aria-hidden="true">{numeral}</div>}
      <p>{title}</p>
      {body && <div>{body}</div>}
      {action}
    </div>
  )
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert">
      <p>Could not load this.</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
