// STUB (P0). F1 owns this file (plan §0.10): Radix wrappers. Keep the props, replace the body.
import { DropdownMenu, Popover as PopoverPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

export function Menu({ trigger, label, children }: { trigger: ReactNode; label?: string; children: ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content aria-label={label}>{children}</DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export interface MenuCheckboxProps {
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
}
export function MenuCheckbox({ checked, disabled, onCheckedChange, children }: MenuCheckboxProps) {
  return (
    <DropdownMenu.CheckboxItem checked={checked} disabled={disabled} onCheckedChange={onCheckedChange}>
      {children}
    </DropdownMenu.CheckboxItem>
  )
}

export function Popover({ trigger, label, children }: { trigger: ReactNode; label?: string; children: ReactNode }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content aria-label={label}>{children}</PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
