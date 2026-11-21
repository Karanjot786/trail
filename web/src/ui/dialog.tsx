// Dialog and Sheet (plan §0.10): Radix Dialog on the one Esc stack. Focus returns to the trigger on close.
// `instant` (keyboard-opened ⌘K / ? overlays) renders with no animation.
import { Dialog as DP } from 'radix-ui'
import { X } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLayer } from './layers'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  side?: 'right'
  size?: 'wide' | 'sm'
  instant?: boolean
  /** Extra header content (actions next to the title). */
  actions?: ReactNode
}

export function Dialog({ open, onOpenChange, title, description, children, side, size, instant, actions }: DialogProps) {
  useLayer(open, () => onOpenChange(false))
  // Controlled dialogs have no Radix Trigger, so remember what had focus and give it back on close.
  const ret = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) ret.current = document.activeElement as HTMLElement | null
  }, [open])
  const sheet = side === 'right'
  return (
    <DP.Root open={open} onOpenChange={onOpenChange}>
      <DP.Portal>
        <DP.Overlay className="scrim" data-instant={instant ? '' : undefined} />
        <DP.Content
          className={sheet ? 'sheet' : 'dialog'}
          data-side={side}
          data-size={size}
          data-instant={instant ? '' : undefined}
          onCloseAutoFocus={(e) => {
            const el = ret.current
            if (el && el !== document.body && document.contains(el)) {
              e.preventDefault()
              el.focus()
            }
          }}
        >
          {sheet && <div className="sheet-grab" aria-hidden="true" />}
          <div className={sheet ? 'sheet-h' : 'dialog-h'}>
            <DP.Title>{title}</DP.Title>
            <span className="spacer" />
            {actions}
            <DP.Close className="icon-btn" aria-label="Close">
              <X size={16} aria-hidden="true" />
            </DP.Close>
          </div>
          {description ? <DP.Description className="dialog-d">{description}</DP.Description> : <DP.Description className="sr-only">{title}</DP.Description>}
          <div className={sheet ? 'sheet-b' : 'dialog-b'}>{children}</div>
        </DP.Content>
      </DP.Portal>
    </DP.Root>
  )
}

/** A dialog docked to the right edge (a bottom sheet on phones). */
export function Sheet(props: DialogProps) {
  return <Dialog side="right" {...props} />
}
