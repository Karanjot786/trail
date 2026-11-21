// STUB (P0). F1 owns this file (plan §0.10): keep the props, replace the body.
import type { ReactNode } from 'react'

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <span>
      {children}
      <span role="tooltip" hidden>
        {content}
      </span>
    </span>
  )
}

/** A small "i" button that explains a term. */
export function InfoHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip content={children}>
      <button type="button" aria-label={label}>
        i
      </button>
    </Tooltip>
  )
}
