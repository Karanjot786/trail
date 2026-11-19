import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="mb-2 grid size-11 place-items-center rounded-full border border-border text-muted">
        <Icon className="size-5" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      {children && <div className="max-w-sm text-pretty text-sm leading-6 text-muted">{children}</div>}
    </div>
  )
}
