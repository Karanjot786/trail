// An <a> that navigates through the router on a plain click and keeps a real href for new tabs.
import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { linkTo, navigate, type Patch } from '../state/useUrlState'

export function RouteLink({ patch, onClick, ...rest }: { patch: Patch } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={linkTo(patch)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(patch)
      }}
      {...rest}
    />
  )
}
