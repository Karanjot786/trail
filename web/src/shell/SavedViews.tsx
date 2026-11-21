// Saved views (plan F1-6): server-saved filter sets under the nav. S or + opens the save popover;
// an open sheet is closed first, since a view never includes one.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bookmark, Plus, X } from 'lucide-react'
import { api } from '../api/client'
import type { SavedView } from '../api/types'
import { invalidate, useQuery } from '../api/useQuery'
import { viewState } from '../state/url'
import { go, linkTo, navigate, useUrlState } from '../state/useUrlState'
import { Popover } from '../ui/menu'
import { Button } from '../ui/button'
import { Kbd } from '../ui/small'
import { toast } from '../ui/toast'
import { DIM_LABEL, rangeLabel, valueLabel } from './labels'
import { useSite } from './useSite'
import { setUi, useUi } from './uiStore'
import { announce } from './announce'
import { writeFailed } from './writes'

/** Opens the save popover. With an open sheet, the sheet closes first. */
export function openSaveView(hasSheet: boolean): void {
  if (hasSheet) {
    navigate({ sheet: null })
    window.setTimeout(() => setUi({ saveView: true }), 0)
  } else setUi({ saveView: true })
}
/** The href that applies a saved view on the current screen. */
export function viewHref(v: SavedView): string {
  const path = linkTo({ sheet: null }).split('?')[0]
  return v.state ? `${path}?${v.state}` : path
}

export function useViews() {
  const { site } = useUrlState()
  return useQuery<SavedView[]>(`views|${site}`, (sig) => api.views(site && site !== 'all' ? site : undefined, sig), { staleMs: 60_000 })
}

export function SavedViews({ onNavigate }: { onNavigate?: () => void }) {
  const s = useUrlState()
  const ui = useUi()
  const views = useViews()
  const list = views.data ?? []
  const here = viewState(s)
  const plusRef = useRef<HTMLButtonElement>(null)

  const remove = async (v: SavedView, i: number) => {
    try {
      await api.deleteView(v.id)
      invalidate('views|')
      views.refetch()
      toast(`Removed “${v.name}”`, { tone: 'good' })
      const next = document.querySelectorAll<HTMLElement>('[data-view-link]')[i + 1] ?? plusRef.current
      next?.focus()
    } catch (e) {
      writeFailed(e)
    }
  }

  return (
    <section role="region" aria-label="Views">
      <div className="nav-label">
        <span className="clabel">Views</span>
        <Popover
          open={ui.saveView}
          onOpenChange={(o) => setUi({ saveView: o })}
          label="Save view"
          role="dialog"
          side={ui.collapsed ? 'right' : 'bottom'}
          align="start"
          trigger={
            <button type="button" className="nav-add" ref={plusRef} aria-label="Save the current view" aria-keyshortcuts="S">
              <Plus size={14} aria-hidden="true" />
            </button>
          }
        >
          <SaveViewForm onDone={() => setUi({ saveView: false })} />
        </Popover>
      </div>
      {list.length ? (
        <ul className="nav" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map((v, i) => {
            const href = viewHref(v)
            const cur = v.state === here && (v.site == null || v.site === s.site)
            return (
              <li key={v.id} className="view-item">
                <a
                  className="nav-item"
                  data-view-link=""
                  href={href}
                  aria-current={cur ? 'page' : undefined}
                  title={v.name}
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
                    e.preventDefault()
                    go(href)
                    onNavigate?.()
                  }}
                >
                  <Bookmark size={16} aria-hidden="true" />
                  <span className="clabel">{v.name}</span>
                </a>
                <button type="button" className="icon-btn view-x" aria-label={`Remove the view ${v.name}`} onClick={() => void remove(v, i)}>
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="views-empty">
          Filter anything, then press <Kbd>S</Kbd> to pin it here.
        </p>
      )}
    </section>
  )
}

function SaveViewForm({ onDone }: { onDone: () => void }) {
  const s = useUrlState()
  const { site } = useSite()
  const suggestion = s.filters.length ? s.filters.map((f) => valueLabel(f.dim, f.value)).join(' + ') : `${rangeLabel(s.range)[0]}${s.site === 'all' ? ', all sites' : ''}`
  const [name, setName] = useState(suggestion)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      await api.createView({ name: n, site: s.site && s.site !== 'all' ? s.site : null, state: viewState(s) })
      invalidate('views|')
      onDone()
      announce(`View ${n} pinned to the sidebar.`)
      toast(`Pinned “${n}” under Views`, { tone: 'good' })
    } catch (err) {
      writeFailed(err)
    } finally {
      setBusy(false)
    }
  }
  const where = `${s.site === 'all' ? 'All websites' : (site?.domain ?? s.site)} · ${rangeLabel(s.range)[0].toLowerCase()}`
  return (
    <form className="save-view" onSubmit={submit}>
      <label htmlFor="vname">
        <b>Save this view</b>
        <span>{where}</span>
      </label>
      {s.filters.length ? (
        <ul className="sv-what" aria-label="Filters in this view">
          {s.filters.map((f) => (
            <li key={f.dim}>
              {DIM_LABEL[f.dim]} is {valueLabel(f.dim, f.value)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="sv-none">No filters are on, so this saves only the range and site.</p>
      )}
      <input ref={input} className="input" id="vname" value={name} maxLength={40} autoComplete="off" required onChange={(e) => setName(e.target.value)} />
      <div className="acts">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={busy}>
          Pin to sidebar
        </Button>
      </div>
    </form>
  )
}

