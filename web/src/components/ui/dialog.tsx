import type * as React from 'react'
import { Dialog as DP } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Dialog = DP.Root
export const DialogClose = DP.Close
export const DialogTitle = DP.Title
export const DialogDescription = DP.Description

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DP.Content>) {
  return (
    <DP.Portal>
      <DP.Overlay className="overlay fixed inset-0 z-50 bg-black/70" />
      <DP.Content
        className={cn(
          'modal fixed left-1/2 top-1/2 z-50 flex max-h-[min(86dvh,760px)] w-[calc(100vw-32px)] max-w-[600px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_rgb(0_0_0/0.7)] outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </DP.Content>
    </DP.Portal>
  )
}
