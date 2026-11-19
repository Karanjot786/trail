import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * One breakdown row: a bar behind the label whose width is the row's share of the top row.
 * No motion here on purpose (data-dense rows).
 */
export function BarRow({
  label,
  value,
  share,
  icon,
  extra,
  active,
  onClick,
  title,
}: {
  label: string
  value: ReactNode
  share: number
  icon?: ReactNode
  extra?: ReactNode
  active?: boolean
  onClick?: () => void
  title?: string
}) {
  const w = `${Math.round(Math.max(0, Math.min(1, share)) * 1000) / 10}%`
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': active } : {})}
      className={cn(
        'group/row relative flex h-8 w-full min-w-0 items-center gap-3 rounded-md px-3 text-left text-[15px] outline-none sm:px-4',
        onClick && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span
        data-testid="bar"
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 rounded-md transition-colors duration-150',
          active ? 'bg-[#1d2a3d]' : 'bg-bar',
          onClick && !active && 'group-hover/row:bg-hover',
        )}
        style={{ width: w }}
      />
      {icon && <span className="relative flex shrink-0 items-center">{icon}</span>}
      <span className="relative min-w-0 flex-1 truncate text-fg" title={title ?? label}>
        {label}
      </span>
      {extra}
      <span className="num relative shrink-0 font-medium text-fg">{value}</span>
    </Comp>
  )
}
