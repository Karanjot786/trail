// Button and IconButton (plan §0.10). Port of the prototype `.btn` / `.icon-btn` onto tokens.
import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '../lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  ref?: Ref<HTMLButtonElement>
}

export function Button({ variant = 'secondary', size = 'md', type = 'button', className, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      data-size={size}
      className={cn('btn', variant !== 'secondary' && `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      {...rest}
    />
  )
}

/** An icon-only button: `aria-label` is required. */
export function IconButton({ size = 'md', type = 'button', className, variant: _v, ...rest }: ButtonProps & { 'aria-label': string }) {
  return <button type={type} data-size={size} className={cn('icon-btn', className)} {...rest} />
}
