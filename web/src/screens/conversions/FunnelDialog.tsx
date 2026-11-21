// Create or edit a funnel (Task F4-3): 2–8 ordered steps (a page, with * for a prefix, or an event) and a
// window of 1 hour, 1 day, 7 days or 30 days.
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { api, HttpError } from '../../api/client'
import type { Funnel, FunnelStep } from '../../api/types'
import { invalidate } from '../../api/useQuery'
import { writeFailed } from '../../shell/writes'
import { Button, IconButton } from '../../ui/button'
import { Dialog } from '../../ui/dialog'

const H = 3_600_000
export const WINDOWS = [
  { ms: H, label: '1 hour' },
  { ms: 24 * H, label: '1 day' },
  { ms: 7 * 24 * H, label: '7 days' },
  { ms: 30 * 24 * H, label: '30 days' },
]
export const windowLabel = (ms: number) => WINDOWS.find((w) => w.ms === ms)?.label ?? `${Math.round(ms / H)} hours`
export const MIN_STEPS = 2
export const MAX_STEPS = 8

export interface FunnelDraft {
  name: string
  windowMs: number
  steps: FunnelStep[]
}
export type FunnelErrors = Partial<Record<'name' | 'steps', string>> & { step?: Record<number, string> }

export function validateFunnel(f: FunnelDraft): FunnelErrors {
  const out: FunnelErrors = {}
  const name = f.name.trim()
  if (!name || [...name].length > 60) out.name = 'Name must be 1-60 characters.'
  if (f.steps.length < MIN_STEPS) out.steps = `A funnel needs at least ${MIN_STEPS} steps.`
  else if (f.steps.length > MAX_STEPS) out.steps = `A funnel has at most ${MAX_STEPS} steps.`
  const step: Record<number, string> = {}
  f.steps.forEach((s, i) => {
    const m = s.match.trim()
    if (!m || [...m].length > 200) step[i] = 'Match must be 1-200 characters.'
    else if (s.kind === 'page' && !m.startsWith('/')) step[i] = 'Paths start with /.'
    else if (s.kind === 'page' && m.slice(0, -1).includes('*')) step[i] = 'Use * only at the end, like /docs/*.'
  })
  if (Object.keys(step).length) out.step = step
  return out
}
const hasErrors = (e: FunnelErrors) => !!(e.name || e.steps || e.step)

const blank = (): FunnelStep => ({ kind: 'page', match: '', label: '' })
const EMPTY: FunnelDraft = { name: '', windowMs: 7 * 24 * H, steps: [blank(), blank()] }

export function FunnelDialog({ open, onOpenChange, site, funnel, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; site: string; funnel?: Funnel | null; onSaved?: (f: Funnel) => void }) {
  const [draft, setDraft] = useState<FunnelDraft>(EMPTY)
  const [touched, setTouched] = useState(false)
  const [server, setServer] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()

  useEffect(() => {
    if (open) {
      setDraft(funnel ? { name: funnel.name, windowMs: funnel.windowMs, steps: funnel.steps.map((s) => ({ ...s })) } : { ...EMPTY, steps: [blank(), blank()] })
      setTouched(false)
      setServer('')
    }
  }, [open, funnel])

  const local = validateFunnel(draft)
  const errors: FunnelErrors = touched ? local : {}
  const setStep = (i: number, patch: Partial<FunnelStep>) => {
    setDraft((d) => ({ ...d, steps: d.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) }))
    setServer('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (hasErrors(local) || busy) return
    setBusy(true)
    const body = { name: draft.name.trim(), windowMs: draft.windowMs, steps: draft.steps.map((s) => ({ kind: s.kind, match: s.match.trim(), label: s.label.trim() || s.match.trim() })) }
    try {
      const f = funnel ? await api.updateFunnel(site, funnel.id, body) : await api.createFunnel(site, body)
      invalidate('f4|')
      onSaved?.(f)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) setServer(err.message.replace(/^bad funnel:\s*/i, ''))
      else writeFailed(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={funnel ? 'Edit funnel' : 'Create a funnel'} description="Steps must happen in order, by the same person, within the window of step 1.">
      <form className="f4-form" onSubmit={submit} noValidate>
        <div className="f4-field">
          <label htmlFor={`${id}-fname`}>Name</label>
          <input
            id={`${id}-fname`}
            className="input"
            value={draft.name}
            maxLength={80}
            autoComplete="off"
            placeholder="Docs to signup"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${id}-name` : undefined}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          {errors.name && (
            <span className="err" id={`${id}-name`} role="alert">
              {errors.name}
            </span>
          )}
        </div>
        <label className="f4-field">
          <span>Window</span>
          <select value={draft.windowMs} onChange={(e) => setDraft((d) => ({ ...d, windowMs: Number(e.target.value) }))}>
            {WINDOWS.map((w) => (
              <option key={w.ms} value={w.ms}>
                within {w.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="f4-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="muted" style={{ marginBottom: 6 }}>
            Steps
          </legend>
          <ol className="f4-steps">
            {draft.steps.map((st, i) => (
              <li key={i}>
                <span className="i" aria-hidden="true">
                  {i + 1}.
                </span>
                <select aria-label={`Step ${i + 1} type`} value={st.kind} onChange={(e) => setStep(i, { kind: e.target.value as FunnelStep['kind'] })}>
                  <option value="page">Page view</option>
                  <option value="event">Event</option>
                </select>
                <span className="flex flex-col gap-1">
                  <input
                    className="input mono"
                    aria-label={`Step ${i + 1} ${st.kind === 'page' ? 'path' : 'event name'}`}
                    value={st.match}
                    maxLength={240}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={st.kind === 'page' ? '/docs/*' : 'Signup'}
                    aria-invalid={!!errors.step?.[i]}
                    onChange={(e) => setStep(i, { match: e.target.value })}
                  />
                  {errors.step?.[i] && <span className="err">{errors.step[i]}</span>}
                </span>
                <IconButton aria-label={`Remove step ${i + 1}`} disabled={draft.steps.length <= 1} onClick={() => setDraft((d) => ({ ...d, steps: d.steps.filter((_, k) => k !== i) }))}>
                  <X size={14} aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ol>
          {draft.steps.length < MAX_STEPS && (
            <Button size="sm" className="self-start" onClick={() => setDraft((d) => ({ ...d, steps: [...d.steps, blank()] }))}>
              <Plus size={14} aria-hidden="true" />
              Add a step
            </Button>
          )}
          {errors.steps && (
            <span className="err" role="alert">
              {errors.steps}
            </span>
          )}
        </fieldset>
        {server && (
          <p className="err" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
            {server}
          </p>
        )}
        <div className="f4-acts">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {funnel ? 'Save funnel' : 'Create funnel'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
