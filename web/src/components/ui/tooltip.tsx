import type * as React from 'react'
import { Tooltip as TP } from 'radix-ui'
import { cn } from '@/lib/utils'

export const TooltipProvider = TP.Provider

/** White bubble with an arrow, as in the Vercel hover pill. */
export function Tooltip({
  label,
  children,
  side = 'top',
}: {
  label: React.ReactNode
  children: React.ReactNode
  side?: React.ComponentProps<typeof TP.Content>['side']
}) {
  return (
    <TP.Root>
      <TP.Trigger asChild>{children}</TP.Trigger>
      <TP.Portal>
        <TP.Content
          side={side}
          sideOffset={6}
          className={cn('tip z-50 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black shadow-lg')}
        >
          {label}
          <TP.Arrow className="fill-white" width={10} height={5} />
        </TP.Content>
      </TP.Portal>
    </TP.Root>
  )
}
