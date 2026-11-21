// Settings → Websites: every site with its state, allowed origins and removal. Add website opens the shell dialog.
import { useState } from 'react'
import { Check, Clock, Globe, Plus, Shield } from 'lucide-react'
import { api } from '../../api/client'
import type { Site } from '../../api/types'
import { invalidate } from '../../api/useQuery'
import { parseOrigins } from '../../lib/install'
import { useSitesQuery } from '../../shell/useSite'
import { setUi } from '../../shell/uiStore'
import { writeFailed } from '../../shell/writes'
import { announce } from '../../shell/announce'
import { navigate, useUrlState } from '../../state/useUrlState'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { Badge } from '../../ui/small'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { toast } from '../../ui/toast'
import { Card, fmtDate } from './parts'

export default function Sites() {
  const { site: selected } = useUrlState()
  const { sites } = useSitesQuery()
  const [editing, setEditing] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Site | null>(null)
  const list = sites.data ?? []

  return (
    <>
      <Card
        icon={Globe}
        title="Websites"
        sub="Each site has its own ID and allowed origins. Data stays in your database."
        actions={
          <Button variant="primary" onClick={() => setUi({ addSite: true })}>
            <Plus size={14} aria-hidden="true" />
            Add website
          </Button>
        }
      >
        {sites.error && !sites.data ? (
          <ErrorState onRetry={sites.refetch} />
        ) : !sites.data ? (
          <div className="scard-b">
            <Skeleton height={40} />
          </div>
        ) : list.length === 0 ? (
          <EmptyState title="No websites yet" body="Add one to get its install snippet." action={<Button onClick={() => setUi({ addSite: true })}>Add website</Button>} />
        ) : (
          list.map((x) => (
            <SiteRow
              key={x.id}
              site={x}
              selected={x.id === selected}
              editing={editing === x.id}
              onEdit={() => setEditing(editing === x.id ? null : x.id)}
              onDone={() => setEditing(null)}
              onRemove={() => setRemoving(x)}
            />
          ))
        )}
      </Card>
      <Card icon={Shield} title="Allowed origins" sub="Where events may come from">
        <div className="scard-b">
          <p className="muted">
            Each site accepts events from its own domain and the origins listed on it. Anything else is rejected with the reason code{' '}
            <code className="inl">origin_not_allowed</code>, never silently. Use <code className="inl">*.example.com</code> for preview deploys. Edit them per site above.
          </p>
        </div>
      </Card>
      <RemoveDialog site={removing} onClose={() => setRemoving(null)} />
    </>
  )
}

function SiteRow({ site, selected, editing, onEdit, onDone, onRemove }: { site: Site; selected: boolean; editing: boolean; onEdit: () => void; onDone: () => void; onRemove: () => void }) {
  const waiting = site.lastEventAt == null
  return (
    <>
      <div className="srow" data-selected={selected ? '' : undefined}>
        <span className="ic" aria-hidden="true">
          <Globe size={14} aria-hidden="true" />
        </span>
        <span className="who">
          <b>{site.domain}</b>
          <span>
            <span className="mono">{site.id}</span> · added {fmtDate(site.created)}
            {site.origins.length > 0 && ` · ${site.origins.length} more ${site.origins.length === 1 ? 'origin' : 'origins'}`}
          </span>
        </span>
        <span className="spacer" />
        {waiting ? (
          <Badge tone="warn">
            <Clock size={12} aria-hidden="true" />
            Waiting
          </Badge>
        ) : (
          <span data-testid="status-receiving" className="badge" data-tone="good">
            <Check size={12} aria-hidden="true" />
            Receiving
          </span>
        )}
        <Button size="sm" onClick={() => navigate({ screen: 'settings', tab: 'install', site: site.id, filters: [], sheet: null })}>
          Install and check
        </Button>
        <Button size="sm" variant="ghost" aria-expanded={editing} aria-label={`Edit origins of ${site.domain}`} onClick={onEdit}>
          Origins
        </Button>
        <Button size="sm" variant="ghost" aria-label={`Remove ${site.domain}`} onClick={onRemove}>
          Remove
        </Button>
      </div>
      {editing && <OriginsEditor site={site} onDone={onDone} />}
    </>
  )
}

function OriginsEditor({ site, onDone }: { site: Site; onDone: () => void }) {
  const [text, setText] = useState(site.origins.join('\n'))
  const [busy, setBusy] = useState(false)
  const id = `origins-${site.id}`
  const save = async () => {
    setBusy(true)
    try {
      await api.updateSite(site.id, { origins: parseOrigins(text) })
      invalidate('sites')
      toast(`Saved the origins of ${site.domain}`, { tone: 'good' })
      onDone()
    } catch (e) {
      writeFailed(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="srow-edit set-field">
      <label htmlFor={id}>
        Allowed origins <span className="hint">besides {site.domain}, one per line</span>
      </label>
      <textarea id={id} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="*.example.vercel.app" spellCheck={false} />
      <div className="set-acts">
        <Button size="sm" variant="primary" disabled={busy} onClick={save}>
          Save origins
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function RemoveDialog({ site, onClose }: { site: Site | null; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const [purge, setPurge] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => {
    setTyped('')
    setPurge(false)
    setErr('')
    onClose()
  }
  const { site: current } = useUrlState()
  const { sites } = useSitesQuery()
  const remove = async () => {
    if (!site) return
    if (typed.trim() !== site.id) {
      setErr(`Type ${site.id} to confirm.`)
      return
    }
    setBusy(true)
    try {
      await api.deleteSite(site.id, purge)
      invalidate('sites')
      toast(`Removed ${site.domain}`, { tone: 'good' })
      announce(`Removed ${site.domain}`)
      if (current === site.id) {
        const next = (sites.data ?? []).find((x) => x.id !== site.id)
        if (next) navigate({ site: next.id, filters: [], sheet: null }, { replace: true })
      }
      close()
    } catch (e) {
      writeFailed(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={!!site} onOpenChange={(o) => !o && close()} title={site ? `Remove ${site.domain}?` : 'Remove website'} size="sm">
      {site && (
        <form
          className="set-form"
          onSubmit={(e) => {
            e.preventDefault()
            void remove()
          }}
        >
          <p className="muted">Trail stops accepting its events at once. Its data stays unless you also delete it below.</p>
          <div className="set-field">
            <label htmlFor="rm-id">
              Type the site ID <span className="mono">{site.id}</span> to confirm
            </label>
            <input
              id="rm-id"
              className="input mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={err ? true : undefined}
              aria-describedby={err ? 'rm-err' : undefined}
            />
            {err && (
              <span id="rm-err" className="err">
                {err}
              </span>
            )}
          </div>
          <label className="set-check">
            <input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} />
            Also delete its events, funnels, notes, share links and tokens
          </label>
          <div className="set-acts end">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={busy}>
              Remove website
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
