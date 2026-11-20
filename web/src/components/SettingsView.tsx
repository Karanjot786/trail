import { useEffect, useId, useState } from 'react'
import { ChevronDownIcon, GlobeIcon, LoaderIcon, MoreHorizontalIcon, PlusIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react'
import { api, type SiteRow } from '@/api'
import { normalizeDomain, parseOrigins, statusText, suggestId } from '@/install'
import { num } from '@/format'
import { cn } from '@/lib/utils'
import { useFetch } from '@/useFetch'
import { set as setDashboard } from '@/state'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { btnPrimary, btnSecondary, Code, Field, inputCls } from './GoalDialog'
import { EmptyState } from './EmptyState'
import { InstallPanel } from './InstallPanel'

// A just-added site keeps its install panel open even when the view remounts
// (adding the first site swaps the welcome screen for the full dashboard).
let justAdded: string | null = null

type DialogState = { kind: 'add' } | { kind: 'origins'; site: SiteRow } | { kind: 'delete'; site: SiteRow } | null

/** Settings → Sites: add, edit and delete sites, and install code per site. */
export function SettingsView({ onSitesChanged }: { onSitesChanged: () => void }) {
  const [gen, setGen] = useState(0)
  const { data: rows, error } = useFetch<SiteRow[]>(`site-rows|${gen}`, (s) => api.siteRows(s))
  const [open, setOpen] = useState<string | null>(() => justAdded) // site whose install panel is open
  const [dialog, setDialog] = useState<DialogState>(null)
  const changed = () => {
    setGen((g) => g + 1)
    onSitesChanged()
  }

  return (
    <section aria-labelledby="sites-h" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id="sites-h" className="text-lg font-medium tracking-[-0.01em] text-fg">
            Sites
          </h2>
          <p className="text-pretty text-sm leading-6 text-muted">
            Each site Trail accepts events for, and where they may come from.
          </p>
        </div>
        <button type="button" onClick={() => setDialog({ kind: 'add' })} className={cn(btnPrimary, 'shrink-0')}>
          <PlusIcon className="size-4" strokeWidth={2} aria-hidden />
          Add site
        </button>
      </div>

      {error && !rows && <p className="text-sm text-bad">Couldn’t load sites: {error.message}</p>}
      {rows && rows.length === 0 && (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={GlobeIcon} title="No sites yet">
            Add a site, paste one snippet into it, and watch the first event arrive here.
          </EmptyState>
        </div>
      )}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((s) => (
            <SiteCard
              key={s.id}
              site={s}
              open={open === s.id}
              onToggle={() => {
                justAdded = null
                setOpen(open === s.id ? null : s.id)
              }}
              onEditOrigins={() => setDialog({ kind: 'origins', site: s })}
              onDelete={() => setDialog({ kind: 'delete', site: s })}
            />
          ))}
        </ul>
      )}

      <AddSiteDialog
        open={dialog?.kind === 'add'}
        onOpenChange={(o) => !o && setDialog(null)}
        onCreated={(s) => {
          justAdded = s.id
          setOpen(s.id)
          setDashboard({ view: 'settings', site: s.id })
          changed()
        }}
      />
      {dialog?.kind === 'origins' && <OriginsDialog site={dialog.site} onClose={() => setDialog(null)} onSaved={changed} />}
      {dialog?.kind === 'delete' && (
        <DeleteDialog
          site={dialog.site}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            if (open === dialog.site.id) setOpen(null)
            changed()
          }}
        />
      )}
    </section>
  )
}

function SiteCard({
  site,
  open,
  onToggle,
  onEditOrigins,
  onDelete,
}: {
  site: SiteRow
  open: boolean
  onToggle: () => void
  onEditOrigins: () => void
  onDelete: () => void
}) {
  const panelId = useId()
  const st = statusText({ ...site, rejected24h: 0 }, Date.now())
  return (
    <li className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="min-w-0 text-[15px] font-medium [overflow-wrap:anywhere] text-fg">{site.domain}</span>
            <span className="shrink-0 rounded-md border border-border-strong bg-raised px-1.5 py-px font-mono text-[12px] text-muted">
              {site.id}
            </span>
          </div>
          <p className="num text-pretty text-[13px] leading-5 text-subtle">
            {site.lastEventAt == null ? (
              'No events yet'
            ) : (
              <>
                {num(site.events24h)} {site.events24h === 1 ? 'event' : 'events'} in 24h ·{' '}
                {st.text.replace('Receiving data · ', '')}
              </>
            )}
          </p>
          <p className="flex min-w-0 items-start gap-1.5 text-[13px] leading-5 text-subtle">
            <ShieldCheckIcon className="mt-[3px] size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {site.domain} and subdomains
              {site.origins.length > 0 && ` · ${site.origins.join(', ')}`}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            className={cn(btnSecondary, 'h-8 gap-1 px-2.5')}
          >
            Install
            <ChevronDownIcon className={cn('chev size-4 text-muted', open && 'rotate-180')} strokeWidth={1.5} aria-hidden />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More for ${site.id}`}
              className="pressable grid size-8 place-items-center rounded-lg text-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontalIcon className="size-4" strokeWidth={1.5} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem onSelect={onEditOrigins}>
                <ShieldCheckIcon className="size-4" strokeWidth={1.5} aria-hidden />
                Allowed origins
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} className="text-bad data-[highlighted]:text-bad">
                <Trash2Icon className="size-4" strokeWidth={1.5} aria-hidden />
                Delete site
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div id={panelId} className="disclose grid" data-open={open}>
        <div className="min-h-0 overflow-hidden">{open && <InstallPanel site={site.id} onEditOrigins={onEditOrigins} />}</div>
      </div>
    </li>
  )
}

function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: React.ReactNode
  onSubmit: (e: React.FormEvent) => void
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-col">
          <div className="flex flex-col gap-1.5 px-5 pb-1 pt-5 sm:px-6 sm:pt-6">
            <DialogTitle className="text-lg font-medium tracking-[-0.01em] text-fg">{title}</DialogTitle>
            <DialogDescription className="text-pretty text-sm leading-6 text-muted">{description}</DialogDescription>
          </div>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
          <div className="flex justify-end gap-2 border-t border-border bg-black/40 px-5 py-4 sm:px-6">{footer}</div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SubmitButton({
  busy,
  disabled,
  children,
  danger,
}: {
  busy: boolean
  disabled?: boolean
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={cn(btnPrimary, danger && 'bg-bad text-white hover:bg-[#ff6668] disabled:hover:bg-bad')}
    >
      {/* Spinner sits in a fixed slot so the label never shifts. */}
      <span className="grid size-4 place-items-center" aria-hidden={!busy}>
        {busy && <LoaderIcon className="size-4 animate-spin" />}
      </span>
      {children}
      <span className="size-4" aria-hidden />
    </button>
  )
}

const errMsg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

function AddSiteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (s: SiteRow) => void
}) {
  const [domain, setDomain] = useState('')
  const [id, setId] = useState('')
  const [idEdited, setIdEdited] = useState(false)
  const [error, setError] = useState<{
    field: 'domain' | 'id'
    msg: string
  } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setDomain('')
      setId('')
      setIdEdited(false)
      setError(null)
    }
  }, [open])

  const host = normalizeDomain(domain)
  const shownId = idEdited ? id : suggestId(host)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!host)
      return setError({
        field: 'domain',
        msg: 'Enter the domain the site runs on.',
      })
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(shownId))
      return setError({
        field: 'id',
        msg: 'Use 1–40 lowercase letters, digits or dashes.',
      })
    setBusy(true)
    try {
      const s = await api.createSite({
        id: shownId,
        domain: host,
        origins: [],
      })
      onCreated(s)
      onOpenChange(false)
    } catch (err) {
      const msg = errMsg(err, 'Couldn’t add the site.')
      setError({
        field: /domain/i.test(msg) ? 'domain' : 'id',
        msg: /exists/i.test(msg) ? 'A site with this id already exists.' : msg,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Add site"
      description="Trail accepts events for this site from its domain and every subdomain."
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={() => onOpenChange(false)} className={btnSecondary}>
            Cancel
          </button>
          <SubmitButton busy={busy}>Add site</SubmitButton>
        </>
      }
    >
      <Field
        label="Domain"
        error={error?.field === 'domain' ? error.msg : undefined}
        help="Paste a URL or type a host, like example.com."
      >
        {(p) => (
          <input
            {...p}
            value={domain}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="url"
            placeholder="example.com"
            onChange={(e) => {
              setDomain(e.target.value)
              setError(null)
            }}
            onBlur={() => host && setDomain(host)}
          />
        )}
      </Field>
      <Field
        label="Site id"
        error={error?.field === 'id' ? error.msg : undefined}
        help={
          <>
            Goes in <Code>data-site</Code>. It can’t be changed later.
          </>
        }
      >
        {(p) => (
          <input
            {...p}
            value={shownId}
            maxLength={40}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="example"
            className={cn(p.className, 'font-mono text-[14px]')}
            onChange={(e) => {
              setId(e.target.value.toLowerCase())
              setIdEdited(true)
              setError(null)
            }}
          />
        )}
      </Field>
    </DialogShell>
  )
}

function OriginsDialog({ site, onClose, onSaved }: { site: SiteRow; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(site.origins.join('\n'))
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const id = useId()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const origins = parseOrigins(text)
    if (origins.length > 20) return setError('At most 20 origins.')
    setBusy(true)
    try {
      await api.updateSite(site.id, { origins })
      onSaved()
      onClose()
    } catch (err) {
      setError(errMsg(err, 'Couldn’t save the origins.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open
      onOpenChange={(o) => !o && onClose()}
      title="Allowed origins"
      description={
        <>
          <span className="text-fg">{site.domain}</span> and its subdomains are always allowed. Add other hosts that load the
          tracker for <span className="font-mono text-[13px] text-fg">{site.id}</span>.
        </>
      }
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <SubmitButton busy={busy}>Save</SubmitButton>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm text-muted">
          One host per line
        </label>
        <textarea
          id={id}
          value={text}
          rows={5}
          autoFocus
          spellCheck={false}
          autoCapitalize="none"
          placeholder={'*.vercel.app\nstaging.example.org'}
          aria-invalid={!!error}
          aria-describedby={`${id}-msg`}
          onChange={(e) => {
            setText(e.target.value)
            setError(undefined)
          }}
          className={cn(inputCls, 'h-auto resize-none py-2 font-mono text-[14px] leading-6')}
        />
        <p
          id={`${id}-msg`}
          aria-live="polite"
          className={cn('min-h-5 text-pretty text-[13px] leading-5', error ? 'text-bad' : 'text-subtle')}
        >
          {error ?? (
            <>
              <Code>*.vercel.app</Code> allows every Vercel preview deployment; <Code>*.example.com</Code> any subdomain of it.
              Localhost is always allowed.
            </>
          )}
        </p>
      </div>
    </DialogShell>
  )
}

function DeleteDialog({ site, onClose, onDeleted }: { site: SiteRow; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('')
  const [purge, setPurge] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const id = useId()
  const match = typed.trim() === site.id

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !match) return
    setBusy(true)
    try {
      await api.deleteSite(site.id, purge)
      onDeleted()
      onClose()
    } catch (err) {
      setError(errMsg(err, 'Couldn’t delete the site.'))
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Delete ${site.domain}?`}
      description="Trail stops accepting its events at once. Its data stays unless you delete it too."
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <SubmitButton busy={busy} disabled={!match} danger>
            {purge ? 'Delete site and data' : 'Delete site'}
          </SubmitButton>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm text-muted">
          Type <span className="font-mono text-fg">{site.id}</span> to confirm
        </label>
        <input
          id={id}
          value={typed}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => setTyped(e.target.value)}
          className={cn(inputCls, 'font-mono text-[14px]')}
          aria-describedby={`${id}-msg`}
        />
        <p id={`${id}-msg`} aria-live="polite" className="min-h-5 text-[13px] leading-5 text-bad">
          {error}
        </p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-strong bg-black px-3 py-2.5">
        <input
          type="checkbox"
          checked={purge}
          onChange={(e) => setPurge(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[#ff4d4f]"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm text-fg">Also delete its data</span>
          <span className="text-pretty text-[13px] leading-5 text-subtle">
            Every event, goal and identity for this site. This can’t be undone.
          </span>
        </span>
      </label>
    </DialogShell>
  )
}
