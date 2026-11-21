// Create a token: a name, what it may do and which site it reads. Shared by AI assistants and API tokens.
// A token covers one site or every site, so picking a site clears the others; the current site starts picked.
import { useId, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { api, HttpError } from '../../api/client'
import type { NewToken, Site, TokenScope } from '../../api/types'
import { invalidate } from '../../api/useQuery'
import { writeFailed } from '../../shell/writes'
import { Button } from '../../ui/button'

const SCOPES: Record<TokenScope, { label: string; hint: string }> = {
  read: { label: 'Read stats only', hint: 'recommended for assistants' },
  notes: { label: 'Stats and chart notes', hint: 'can also add notes like “deployed v2”' },
  write: { label: 'Everything in the API', hint: 'for your own scripts' },
  crawl: { label: 'Crawler logs only', hint: 'for trail crawlers import' },
}

export function TokenForm({
  scopes,
  sites,
  current,
  defaultName = '',
  onCreated,
  onCancel,
}: {
  scopes: TokenScope[]
  sites: Site[]
  current: string
  defaultName?: string
  onCreated: (t: NewToken) => void
  onCancel?: () => void
}) {
  const uid = useId()
  const [name, setName] = useState(defaultName)
  const [scope, setScope] = useState<TokenScope>(scopes[0])
  // undefined until the person picks: the current site, once the site list has loaded.
  const [picked, setSite] = useState<string | null | undefined>(undefined)
  const site = picked !== undefined ? picked : sites.some((x) => x.id === current) ? current : null
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) {
      setErr('Give the token a name, so you know which one to revoke later.')
      document.getElementById(`${uid}-name`)?.focus()
      return
    }
    setErr('')
    setBusy(true)
    try {
      const t = await api.createToken({ name: name.trim(), scope, site })
      invalidate('tokens')
      onCreated(t)
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 409)) setErr(e.status === 409 ? 'A token with that name exists. Choose another name.' : e.message)
      else writeFailed(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="set-form boxed"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="set-field">
        <label htmlFor={`${uid}-name`}>Token name</label>
        <span id={`${uid}-hint`} className="hint">
          So you know which one to revoke later
        </span>
        <input
          id={`${uid}-name`}
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="off"
          aria-invalid={err ? true : undefined}
          aria-describedby={`${uid}-hint${err ? ` ${uid}-err` : ''}`}
        />
        {err && (
          <span id={`${uid}-err`} className="err">
            {err}
          </span>
        )}
      </div>
      <fieldset className="set-field">
        <legend>Access</legend>
        {scopes.map((sc) => (
          <label key={sc} className="set-check">
            <input type="radio" name={`${uid}-scope`} value={sc} checked={scope === sc} onChange={() => setScope(sc)} />
            {SCOPES[sc].label} <span className="muted">({SCOPES[sc].hint})</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="set-field">
        <legend>
          Sites it can read <span className="hint">One site, or all of them</span>
        </legend>
        {sites.map((x) => (
          <label key={x.id} className="set-check">
            <input type="checkbox" checked={site === x.id} onChange={(e) => setSite(e.target.checked ? x.id : null)} />
            {x.domain} only
          </label>
        ))}
        <label className="set-check">
          <input type="checkbox" checked={site === null} onChange={(e) => e.target.checked && setSite(null)} />
          All sites, including ones you add later
        </label>
      </fieldset>
      <div className="set-acts">
        <Button type="submit" variant="primary" disabled={busy}>
          <KeyRound size={14} aria-hidden="true" />
          Create token
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
