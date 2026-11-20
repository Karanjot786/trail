import { useEffect, useId, useState, type ReactNode } from 'react'
import { LoaderIcon } from 'lucide-react'
import { ToggleGroup } from 'radix-ui'
import { api, type Goal } from '@/api'
import { validateGoal, type GoalDraft } from '@/goals'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'

const KINDS: { value: Goal['kind']; label: string }[] = [
  { value: 'page', label: 'Page visit' },
  { value: 'event', label: 'Custom event' },
]

const HELP: Record<Goal['kind'], { label: string; placeholder: string; help: ReactNode }> = {
  page: {
    label: 'Path',
    placeholder: '/pricing',
    help: (
      <>
        End with <Code>*</Code> to match every page under it, like <Code>/blog/*</Code>.
      </>
    ),
  },
  event: {
    label: 'Event name',
    placeholder: 'Signup',
    help: (
      <>
        The name you pass to <Code>trail.track()</Code>.
      </>
    ),
  },
}

export function GoalDialog({
  open,
  onOpenChange,
  site,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  site: string
  onCreated: (g: Goal) => void
}) {
  const [draft, setDraft] = useState<GoalDraft>({ name: '', kind: 'page', match: '' })
  const [touched, setTouched] = useState({ name: false, match: false })
  const [server, setServer] = useState<Partial<Record<'name' | 'match', string>>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft({ name: '', kind: 'page', match: '' })
      setTouched({ name: false, match: false })
      setServer({})
    }
  }, [open])

  const local = validateGoal(draft)
  const errors = {
    name: server.name ?? (touched.name ? local.name : undefined),
    match: server.match ?? (touched.match ? local.match : undefined),
  }
  const edit = (patch: Partial<GoalDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setServer({})
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ name: true, match: true })
    if (local.name || local.match || busy) return
    setBusy(true)
    try {
      const g = await api.createGoal(site, { name: draft.name.trim(), kind: draft.kind, match: draft.match.trim() })
      onCreated(g)
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Couldn’t save the goal.'
      // The server answers 400 with one message; show it under the field it is about.
      setServer(/name/i.test(msg) ? { name: msg } : { match: msg })
    } finally {
      setBusy(false)
    }
  }

  const h = HELP[draft.kind]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <form onSubmit={submit} noValidate className="flex flex-col">
          <div className="flex flex-col gap-1.5 px-5 pb-1 pt-5 sm:px-6 sm:pt-6">
            <DialogTitle className="text-lg font-medium tracking-[-0.01em] text-fg">Add goal</DialogTitle>
            <DialogDescription className="text-pretty text-sm leading-6 text-muted">
              Count visitors who reach a page or fire an event.
            </DialogDescription>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4 sm:px-6">
            <Field label="Name" error={errors.name} help="Shown on the dashboard.">
              {(p) => (
                <input
                  {...p}
                  value={draft.name}
                  maxLength={80}
                  autoComplete="off"
                  placeholder="Signed up"
                  onChange={(e) => edit({ name: e.target.value })}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                />
              )}
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted" id="goal-kind">
                Goal type
              </span>
              <Segmented value={draft.kind} onChange={(kind) => edit({ kind })} />
            </div>

            <Field label={h.label} error={errors.match} help={h.help}>
              {(p) => (
                <input
                  {...p}
                  value={draft.match}
                  maxLength={240}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={h.placeholder}
                  className={cn(p.className, 'font-mono text-[14px]')}
                  onChange={(e) => edit({ match: e.target.value })}
                  onBlur={() => setTouched((t) => ({ ...t, match: true }))}
                />
              )}
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-black/40 px-5 py-4 sm:px-6">
            <button type="button" onClick={() => onOpenChange(false)} className={btnSecondary}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={btnPrimary}>
              {/* Spinner sits in a fixed slot so the label never shifts. */}
              <span className="grid size-4 place-items-center" aria-hidden={!busy}>
                {busy && <LoaderIcon className="size-4 animate-spin" />}
              </span>
              Add goal
              <span className="size-4" aria-hidden />
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export const btnPrimary =
  'pressable inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-fg px-3 text-sm font-medium text-black outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
export const btnSecondary =
  'pressable inline-flex h-9 items-center justify-center rounded-lg border border-border-strong px-3.5 text-sm font-medium text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring'

const inputCls =
  'h-10 w-full rounded-lg border border-border-strong bg-black px-3 text-[15px] text-fg outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle focus-visible:border-[#3b3b3b] focus-visible:ring-2 focus-visible:ring-ring/60 aria-[invalid=true]:border-bad/70 aria-[invalid=true]:focus-visible:ring-bad/40'

/** Label, control and one message line. The message slot is always there, so errors never move the layout. */
function Field({
  label,
  error,
  help,
  children,
}: {
  label: string
  error?: string
  help: ReactNode
  children: (p: { id: string; className: string; 'aria-invalid': boolean; 'aria-describedby': string }) => ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      {children({ id, className: inputCls, 'aria-invalid': !!error, 'aria-describedby': `${id}-msg` })}
      <p id={`${id}-msg`} aria-live="polite" className={cn('min-h-5 text-[13px] leading-5', error ? 'text-bad' : 'text-subtle')}>
        {error ?? help}
      </p>
    </div>
  )
}

/** Two-option segmented control; the thumb slides on transform so the change is interruptible. */
function Segmented({ value, onChange }: { value: Goal['kind']; onChange: (v: Goal['kind']) => void }) {
  const i = KINDS.findIndex((k) => k.value === value)
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as Goal['kind'])}
      aria-labelledby="goal-kind"
      className="relative grid h-10 grid-cols-2 rounded-lg border border-border-strong bg-black p-1"
    >
      <span
        aria-hidden
        className="seg-thumb absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-md bg-hover shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]"
        style={{ transform: `translateX(${i * 100}%)` }}
      />
      {KINDS.map((k) => (
        <ToggleGroup.Item
          key={k.value}
          value={k.value}
          className="relative rounded-md text-sm font-medium text-muted outline-none transition-colors duration-150 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:text-fg"
        >
          {k.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-raised px-1 py-px font-mono text-[12px] text-muted">{children}</code>
}
