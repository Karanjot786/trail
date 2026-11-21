// Tooltip and InfoHint (plan §0.10; design-system components/tooltip-infohint.md).
// Tooltip: Radix, 280 ms hover delay, instant when another one closed in the last 400 ms.
// InfoHint: a definition that opens on hover, focus or tap (a non-modal popover; Esc closes it).
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Popover as PP, Tooltip as TP } from 'radix-ui'
import { Info } from 'lucide-react'
import { useLayer } from './layers'

const HasProvider = createContext(false)

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TP.Provider delayDuration={280} skipDelayDuration={400}>
      <HasProvider.Provider value>{children}</HasProvider.Provider>
    </TP.Provider>
  )
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  const has = useContext(HasProvider)
  const tip = (
    <TP.Root>
      <TP.Trigger asChild>{children}</TP.Trigger>
      <TP.Portal>
        <TP.Content className="tip tip-sm" side={side} sideOffset={6} collisionPadding={8}>
          {content}
        </TP.Content>
      </TP.Portal>
    </TP.Root>
  )
  return has ? tip : <TooltipProvider>{tip}</TooltipProvider>
}

const fine = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches

/** A small "i" button (or the term itself, with `term`) that explains a term. */
export function InfoHint({ label, children, term }: { label: string; children: ReactNode; term?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const focusAt = useRef(0)
  const hover = useRef<number | undefined>(undefined)
  useLayer(open, () => setOpen(false))
  useEffect(() => () => window.clearTimeout(hover.current), [])
  return (
    <PP.Root open={open} onOpenChange={setOpen}>
      <PP.Anchor asChild>
        <button
          type="button"
          className={term ? 'def' : 'infob'}
          aria-label={term ? undefined : label}
          aria-expanded={open}
          aria-describedby={open ? id : undefined}
          onFocus={() => {
            focusAt.current = Date.now()
            setOpen(true)
          }}
          onBlur={() => setOpen(false)}
          onClick={() => {
            // A tap focuses then clicks: keep the card the focus just opened.
            if (Date.now() - focusAt.current < 400) return setOpen(true)
            setOpen((o) => !o)
          }}
          onPointerEnter={() => {
            if (!fine()) return
            window.clearTimeout(hover.current)
            hover.current = window.setTimeout(() => setOpen(true), 280)
          }}
          onPointerLeave={() => {
            if (!fine()) return
            window.clearTimeout(hover.current)
            setOpen(false)
          }}
        >
          {term ?? <Info aria-hidden="true" />}
        </button>
      </PP.Anchor>
      <PP.Portal>
        <PP.Content
          id={id}
          role="tooltip"
          className="tip"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <b>{label}</b>
          {children}
        </PP.Content>
      </PP.Portal>
    </PP.Root>
  )
}
