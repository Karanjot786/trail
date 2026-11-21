// STUB (P0). F1 owns this file (plan §0.10): a Radix Dialog with the title. Keep the props, replace the body.
import { Dialog as DP } from 'radix-ui'
import type { ReactNode } from 'react'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  side?: 'right'
}

export function Dialog({ open, onOpenChange, title, description, children, side }: DialogProps) {
  return (
    <DP.Root open={open} onOpenChange={onOpenChange}>
      <DP.Portal>
        <DP.Overlay />
        <DP.Content data-side={side}>
          <DP.Title>{title}</DP.Title>
          {description ? <DP.Description>{description}</DP.Description> : <DP.Description className="sr-only">{title}</DP.Description>}
          {children}
        </DP.Content>
      </DP.Portal>
    </DP.Root>
  )
}

/** A dialog docked to the right edge. */
export function Sheet(props: DialogProps) {
  return <Dialog side="right" {...props} />
}
