// Add or edit a goal (Task F4-2): a page (with * at the end for a prefix) or a custom event, with event-name
// suggestions from the event catalogue. Checks and server errors use the same words (lib/goals.ts).
import { useEffect, useId, useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import type { Goal } from '../../api/types'
import { invalidate } from '../../api/useQuery'
import { goalServerError, validateGoal, type GoalDraft, type GoalErrors } from '../../lib/goals'
import { HttpError } from '../../api/client'
import { writeFailed } from '../../shell/writes'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { Segmented } from '../../ui/tabs'
import { useReport } from './kit'

export interface GoalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: string
  goal?: Goal | null
  onSaved?: (g: Goal) => void
}

const EMPTY: GoalDraft = { name: '', kind: 'page', match: '' }

export function GoalDialog({ open, onOpenChange, site, goal, onSaved }: GoalDialogProps) {
  const [draft, setDraft] = useState<GoalDraft>(EMPTY)
  const [touched, setTouched] = useState(false)
  const [server, setServer] = useState<GoalErrors>({})
  const [busy, setBusy] = useState(false)
  const id = useId()
  const events = useReport('events', (q, sig) => api.events(q, { limit: 200 }, sig), { enabled: open && draft.kind === 'event' })

  useEffect(() => {
    if (open) {
      setDraft(goal ? { name: goal.name, kind: goal.kind, match: goal.match } : EMPTY)
      setTouched(false)
      setServer({})
    }
  }, [open, goal])

  const local = validateGoal(draft)
  const errors: GoalErrors = { name: server.name ?? (touched ? local.name : undefined), match: server.match ?? (touched ? local.match : undefined) }
  const edit = (patch: Partial<GoalDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setServer({})
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (local.name || local.match || busy) return
    setBusy(true)
    const body = { name: draft.name.trim(), kind: draft.kind, match: draft.match.trim() }
    try {
      const g = goal ? await api.updateGoal(site, goal.id, body) : await api.createGoal(site, body)
      invalidate('f4|')
      onSaved?.(g)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) setServer(goalServerError(err.message))
      else writeFailed(err)
    } finally {
      setBusy(false)
    }
  }

  const err = (k: 'name' | 'match') =>
    errors[k] ? (
      <span className="err" id={`${id}-${k}-err`} role="alert">
        {errors[k]}
      </span>
    ) : null
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={goal ? 'Edit goal' : 'Add a goal'} description="A goal turns a page or an event into a number you can watch." size="sm">
      <form className="f4-form" onSubmit={submit} noValidate>
        <div className="f4-field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            className="input"
            value={draft.name}
            maxLength={80}
            autoComplete="off"
            placeholder="Signup"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${id}-name-err` : undefined}
            onChange={(e) => edit({ name: e.target.value })}
          />
          {err('name')}
        </div>
        <div className="f4-field">
          <span id={`${id}-kind`}>Goal type</span>
          <Segmented
            value={draft.kind}
            onValueChange={(v) => edit({ kind: v as Goal['kind'] })}
            ariaLabel="Goal type"
            items={[
              { value: 'page', label: 'Page visit' },
              { value: 'event', label: 'Custom event' },
            ]}
          />
        </div>
        <div className="f4-field">
          <label htmlFor={`${id}-match`}>{draft.kind === 'page' ? 'Path' : 'Event name'}</label>
          <input
            id={`${id}-match`}
            className="input mono"
            value={draft.match}
            maxLength={240}
            autoComplete="off"
            spellCheck={false}
            placeholder={draft.kind === 'page' ? '/pricing' : 'Signup'}
            list={draft.kind === 'event' ? `${id}-events` : undefined}
            aria-invalid={!!errors.match}
            aria-describedby={errors.match ? `${id}-match-err` : `${id}-match-help`}
            onChange={(e) => edit({ match: e.target.value })}
          />
          {err('match') ?? (
            <span className="help" id={`${id}-match-help`}>
              {draft.kind === 'page' ? 'End with * to match every page under it, like /blog/*.' : 'The name you pass to trail.track().'}
            </span>
          )}
          {draft.kind === 'event' && (
            <datalist id={`${id}-events`}>
              {(events.data?.rows ?? []).filter((r) => r.kind === 'custom').map((r) => (
                <option key={r.name} value={r.name} />
              ))}
            </datalist>
          )}
        </div>
        <div className="f4-acts">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {goal ? 'Save goal' : 'Add goal'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
