import type * as React from 'react'
import { DropdownMenu as DM } from 'radix-ui'
import { cn } from '@/lib/utils'

export const DropdownMenu = DM.Root
export const DropdownMenuTrigger = DM.Trigger
export const DropdownMenuGroup = DM.Group

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={sideOffset}
        className={cn(
          'pop z-50 min-w-48 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-[0_8px_30px_rgb(0_0_0/0.6)]',
          className,
        )}
        {...props}
      />
    </DM.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        'flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-3 text-sm text-fg outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn('px-3 py-1.5 text-xs text-muted', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn('my-1 h-px bg-border', className)} {...props} />
}
