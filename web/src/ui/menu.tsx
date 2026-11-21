// Menu, MenuItem, MenuRadio, MenuCheckbox, Popover (plan §0.10): Radix wrappers on the one Esc stack.
import { DropdownMenu as DM, Popover as PP } from 'radix-ui'
import { Check } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useLayer } from './layers'

type Side = 'top' | 'bottom' | 'left' | 'right'
type Align = 'start' | 'center' | 'end'

function useOpen(open?: boolean, onOpenChange?: (o: boolean) => void) {
  const [inner, setInner] = useState(false)
  const value = open ?? inner
  const set = (o: boolean) => {
    if (open === undefined) setInner(o)
    onOpenChange?.(o)
  }
  useLayer(value, () => set(false))
  return [value, set] as const
}

export interface MenuProps {
  trigger: ReactNode
  label?: string
  children: ReactNode
  align?: Align
  side?: Side
  minWidth?: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function Menu({ trigger, label, children, align = 'start', side = 'bottom', minWidth, open, onOpenChange }: MenuProps) {
  const [o, setO] = useOpen(open, onOpenChange)
  return (
    <DM.Root open={o} onOpenChange={setO} modal={false}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content className="pop" aria-label={label} align={align} side={side} sideOffset={6} collisionPadding={8} style={minWidth ? { minWidth } : undefined}>
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}

export function MenuItem({ children, onSelect, end, disabled }: { children: ReactNode; onSelect: () => void; end?: ReactNode; disabled?: boolean }) {
  return (
    <DM.Item className="mi" onSelect={onSelect} disabled={disabled}>
      {children}
      {end != null && <span className="end">{end}</span>}
    </DM.Item>
  )
}

/** A single-choice item with a check when chosen. Group them in MenuRadioGroup. */
export function MenuRadio({ value, children, end, onSelect }: { value: string; children: ReactNode; end?: ReactNode; onSelect?: (e: Event) => void }) {
  return (
    <DM.RadioItem className="mi" value={value} onSelect={onSelect}>
      <span className="chk">
        <DM.ItemIndicator>
          <Check size={14} aria-hidden="true" />
        </DM.ItemIndicator>
      </span>
      {children}
      {end != null && <span className="end">{end}</span>}
    </DM.RadioItem>
  )
}
export const MenuRadioGroup = DM.RadioGroup

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="ph">{children}</DM.Label>
}
export function MenuSeparator() {
  return <DM.Separator className="sep" />
}

export interface MenuCheckboxProps {
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
}
export function MenuCheckbox({ checked, disabled, onCheckedChange, children }: MenuCheckboxProps) {
  return (
    <DM.CheckboxItem
      className="mi"
      checked={checked}
      disabled={disabled}
      onCheckedChange={(c) => {
        if (!disabled) onCheckedChange(c === true)
      }}
      onSelect={(e) => e.preventDefault()}
    >
      <span className="cbx">
        <DM.ItemIndicator>
          <Check size={12} aria-hidden="true" />
        </DM.ItemIndicator>
      </span>
      {children}
    </DM.CheckboxItem>
  )
}

export interface PopoverProps {
  trigger: ReactNode
  label?: string
  children: ReactNode
  align?: Align
  side?: Side
  open?: boolean
  onOpenChange?: (open: boolean) => void
  role?: 'dialog'
}
export function Popover({ trigger, label, children, align = 'start', side = 'bottom', open, onOpenChange, role }: PopoverProps) {
  const [o, setO] = useOpen(open, onOpenChange)
  return (
    <PP.Root open={o} onOpenChange={setO}>
      <PP.Trigger asChild>{trigger}</PP.Trigger>
      <PP.Portal>
        <PP.Content className="pop" role={role} aria-label={label} align={align} side={side} sideOffset={6} collisionPadding={8}>
          {children}
        </PP.Content>
      </PP.Portal>
    </PP.Root>
  )
}
