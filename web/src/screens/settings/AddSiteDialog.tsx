// Add website (plan F5-1): domain and ID (the server stores no site name), checked here and then by the server. Opened from the switcher,
// the palette and Settings → Websites; the shell then takes the person to Install for the new site.
import { useEffect, useRef, useState } from 'react'
import { api, HttpError } from '../../api/client'
import type { Site } from '../../api/types'
import { suggestId } from '../../lib/install'
import { writeFailed } from '../../shell/writes'
import { useSitesQuery } from '../../shell/useSite'
import { setUi } from '../../shell/uiStore'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { toast } from '../../ui/toast'
import { siteFromForm } from './model'
import './settings.css'

export interface AddSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (site: Site) => void
}

type Field = 'id' | 'domain'

export function AddSiteDialog({ open, onOpenChange, onAdded }: AddSiteDialogProps) {
  const [id, setId] = useState('')
  const [domain, setDomain] = useState('')
  const [err, setErr] = useState<{ field: Field | 'form'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // After the shell drops the cached site list, fetch it again and repaint the shell, so the new site is known
  // when the shell lands on its Install page (the shell's own hook does not refetch on invalidate).
  const sitesQ = useSitesQuery().sites
  const added = useRef<string | null>(null)
  useEffect(() => {
    if (added.current && sitesQ.data?.some((x) => x.id === added.current)) {
      added.current = null
      setUi({})
    }
  }, [sitesQ.data])
  const refs = { id: useRef<HTMLInputElement>(null), domain: useRef<HTMLInputElement>(null) }

  useEffect(() => {
    if (!open) return
    setId('')
    setDomain('')
    setErr(null)
  }, [open])

  const fail = (field: Field | 'form', text: string) => {
    setErr({ field, text })
    if (field !== 'form') refs[field].current?.focus()
  }

  const submit = async () => {
    const f = siteFromForm(id, domain)
    if (!f.ok) return fail(f.field, f.error)
    setErr(null)
    setBusy(true)
    try {
      const site = await api.createSite(f.site)
      toast(`Added ${site.domain}. Install the snippet, then send a test visit.`, { tone: 'good' })
      added.current = site.id
      onAdded(site)
      sitesQ.refetch()
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) fail('id', `That id is taken. Choose another, like ${f.site.id}-2.`)
      else if (e instanceof HttpError && e.status === 400) fail('form', e.message)
      else writeFailed(e)
    } finally {
      setBusy(false)
    }
  }

  const props = (field: Field) => ({
    ref: refs[field],
    id: `as-${field}`,
    'aria-invalid': err?.field === field ? true : undefined,
    'aria-describedby': `as-${field}-hint${err?.field === field ? ` as-${field}-err` : ''}`,
  })
  const errText = (field: Field) =>
    err?.field === field && (
      <span id={`as-${field}-err`} className="err">
        {err.text}
      </span>
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add website" size="sm">
      <form
        className="set-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="set-field">
          <label htmlFor="as-domain">Domain</label>
          <span id="as-domain-hint" className="hint">
            Events from other origins are rejected with a reason code
          </span>
          <input
            {...props('domain')}
            className="input mono"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            autoComplete="off"
            inputMode="url"
            spellCheck={false}
          />
          {errText('domain')}
        </div>
        <div className="set-field">
          <label htmlFor="as-id">Site ID</label>
          <span id="as-id-hint" className="hint">
            Goes in the snippet as data-site. Lowercase letters, digits and dashes.
          </span>
          <input
            {...props('id')}
            className="input mono"
            value={id}
            onChange={(e) => setId(e.target.value)}
            maxLength={40}
            placeholder={suggestId(domain) || 'example'}
            autoComplete="off"
            spellCheck={false}
          />
          {errText('id')}
        </div>
        {err?.field === 'form' && (
          <p className="form-err" role="alert">
            {err.text}
          </p>
        )}
        <div className="set-acts end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Add and install
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
