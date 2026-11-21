// STUB (P0). F1 owns this file (plan §0.10): keep the props, replace the body.
import type { ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'secondary', size = 'md', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} data-variant={variant} data-size={size} {...rest} />
}

/** An icon-only button: `aria-label` is required. */
export function IconButton(props: ButtonProps & { 'aria-label': string }) {
  return <Button variant="ghost" {...props} />
}
