import { useState } from 'react'
import { AlertDialog } from 'radix-ui'
import { MoreHorizontalIcon, PlusIcon, TargetIcon, Trash2Icon } from 'lucide-react'
import { api, type GoalRow } from '@/api'
import { queryKey, useDashboard } from '@/state'
import { useFetch } from '@/useFetch'
import { badgeTone, change, delta, num } from '@/format'
import { formatRate, goalLabel } from '@/goals'
import { cn } from '@/lib/utils'
import { BarRow } from './BarRow'
import { EmptyState } from './EmptyState'
import { GoalDialog, btnPrimary, btnSecondary } from './GoalDialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'

/** Goals and their conversion rate for the range. Replaces the old Flags placeholder. */
export function GoalsPanel({ readOnly = false }: { readOnly?: boolean }) {
  const d = useDashboard()
  const [gen, setGen] = useState(0)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<GoalRow | null>(null)
  const { data: rows } = useFetch(queryKey(d.query, 'goals', gen), (s) => api.goalReport(d.query, s))
  const max = rows?.length ? Math.max(...rows.map((r) => r.rate)) || 1 : 1
  const reload = () => setGen((g) => g + 1)

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-black" aria-label="Goals">
      <header className="flex h-16 items-stretch justify-between gap-3 border-b border-border pl-3 pr-4 sm:pl-4 sm:pr-6">
        <div className="relative flex items-center px-2 text-[15px] text-fg sm:px-3">
          Goals
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white" aria-hidden />
        </div>
        {rows && rows.length > 0 && (
          // Right edges line up with the value columns below (list padding + row menu + row padding).
          <div className={cn('flex shrink-0 items-center gap-3 sm:gap-6', readOnly ? 'mr-2' : 'mr-11')} aria-hidden>
            <span className={cn(colLabel, 'w-11 text-right sm:w-[58px]')}>Visitors</span>
            <span className={cn(colLabel, 'w-[90px] text-right sm:w-[112px]')}>Rate</span>
          </div>
        )}
      </header>

      <div className="h-[304px] overflow-y-auto px-3 pt-3 [scrollbar-width:thin] sm:px-4">
        {rows && rows.length === 0 ? (
          <EmptyState icon={TargetIcon} title="No goals yet">
            <p>Count the visitors who reach a page or fire an event, and see what share of all visitors convert.</p>
            {!readOnly && (
              <button type="button" className={cn(btnPrimary, 'mt-4')} onClick={() => setAdding(true)}>
                <PlusIcon className="size-4" strokeWidth={2} aria-hidden /> Add goal
              </button>
            )}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2 pb-3">
            {(rows ?? []).map((r) => (
              <li key={r.id} className="group/goal flex min-w-0 items-center gap-1">
                <div className="min-w-0 flex-1">
                  <BarRow
                    label={r.name}
                    title={`${r.name} · ${goalLabel(r)}`}
                    share={r.rate / max}
                    value={<GoalValue row={r} />}
                  />
                </div>
                {!readOnly && <RowMenu name={r.name} onDelete={() => setRemoving(r)} />}
              </li>
            ))}
            {rows && !readOnly && (
              <li>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="pressable flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-[15px] text-muted outline-none hover:bg-bar hover:text-fg focus-visible:ring-2 focus-visible:ring-ring sm:px-4"
                >
                  <PlusIcon className="size-4" strokeWidth={1.75} aria-hidden /> Add goal
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {!readOnly && (
        <>
          <GoalDialog open={adding} onOpenChange={setAdding} site={d.site} onCreated={reload} />
          <DeleteGoal
            goal={removing}
            onClose={() => setRemoving(null)}
            onConfirm={async (g) => {
              await api.deleteGoal(d.site, g.id)
              reload()
            }}
          />
        </>
      )}
    </section>
  )
}

const colLabel = 'whitespace-nowrap text-[13px] font-medium uppercase tracking-[0.02em] text-muted'

function GoalValue({ row }: { row: GoalRow }) {
  const ch = change(row.rate, row.prev.rate)
  const tone = badgeTone('visitors', ch)
  return (
    <span className="flex items-center gap-3 sm:gap-6">
      <span className="w-11 text-right sm:w-[58px]">{num(row.visitors)}</span>
      <span className="flex w-[90px] items-center justify-end gap-1.5 sm:w-[112px] sm:gap-2">
        <span>{formatRate(row.rate)}</span>
        <span
          title={`vs previous period (${formatRate(row.prev.rate)})`}
          className={cn(
            'w-10 rounded-md py-0.5 text-center text-xs font-medium sm:w-11',
            tone === 'good' && 'bg-good-bg text-good',
            tone === 'bad' && 'bg-bad-bg text-bad',
            tone === 'neutral' && 'bg-raised text-muted',
          )}
        >
          {delta(row.rate, row.prev.rate)}
        </span>
      </span>
    </span>
  )
}

function RowMenu({ name, onDelete }: { name: string; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${name}`}
        className="pressable grid size-8 shrink-0 place-items-center rounded-md text-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-hover data-[state=open]:text-fg [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/goal:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:data-[state=open]:opacity-100"
      >
        <MoreHorizontalIcon className="size-[18px]" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onDelete} className="text-bad data-[highlighted]:bg-bad-bg [&_svg]:text-bad">
            <Trash2Icon strokeWidth={1.5} /> Delete goal
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DeleteGoal({
  goal,
  onClose,
  onConfirm,
}: {
  goal: GoalRow | null
  onClose: () => void
  onConfirm: (g: GoalRow) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Keep the last goal while the dialog animates out, so the text doesn't blank mid-exit.
  const [shown, setShown] = useState<GoalRow | null>(null)
  if (goal && goal !== shown) setShown(goal)
  return (
    <AlertDialog.Root
      open={!!goal}
      onOpenChange={(o) => {
        if (!o) {
          setErr('')
          onClose()
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="overlay fixed inset-0 z-50 bg-black/70" />
        <AlertDialog.Content className="modal fixed left-1/2 top-1/2 z-50 flex w-[calc(100vw-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_rgb(0_0_0/0.7)] outline-none">
          <div className="flex flex-col gap-1.5 px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
            <AlertDialog.Title className="text-lg font-medium tracking-[-0.01em] text-fg">Delete goal?</AlertDialog.Title>
            <AlertDialog.Description className="text-pretty text-sm leading-6 text-muted">
              <span className="text-fg">{shown?.name}</span> will no longer show on the dashboard. Your events stay, so adding the
              goal again brings the numbers back.
            </AlertDialog.Description>
            {err && <p className="text-[13px] text-bad">{err}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-black/40 px-5 py-4 sm:px-6">
            <AlertDialog.Cancel className={btnSecondary}>Cancel</AlertDialog.Cancel>
            <button
              type="button"
              disabled={busy}
              className="pressable inline-flex h-9 items-center justify-center rounded-lg bg-bad px-3.5 text-sm font-medium text-white outline-none hover:bg-[#ff6163] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              onClick={async () => {
                if (!goal) return
                setBusy(true)
                try {
                  await onConfirm(goal)
                  onClose()
                } catch (e) {
                  setErr(e instanceof Error ? e.message : 'Couldn’t delete the goal.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Delete goal
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
