// Share a read-only link (plan F5-4): says who can open it and exactly what it carries, sets an expiry and
// hide-revenue, creates and copies the link, and lists this view's active links with Revoke. Reads the URL itself.
import { useState } from 'react'
import { Eye, Link2, Shield } from 'lucide-react'
import { api } from '../../api/client'
import type { Share } from '../../api/types'
import { invalidate, useQuery } from '../../api/useQuery'
import { fmtRange } from '../../lib/format'
import { DIM_LABEL, rangeLabel, valueLabel } from '../../shell/labels'
import { useSite } from '../../shell/useSite'
import { useStats } from '../../shell/useStats'
import { writeFailed } from '../../shell/writes'
import { SCREENS } from '../../routes'
import { viewState } from '../../state/url'
import { useUrlState } from '../../state/useUrlState'
import { Button } from '../../ui/button'
import { CopyButton } from '../../ui/code'
import { Dialog } from '../../ui/dialog'
import { Segmented } from '../../ui/tabs'
import { toast } from '../../ui/toast'
import { expiresText, SHARE_TTLS, type ShareTtl } from './model'
import { Switch } from './parts'
import { createShare } from './remote'
import './settings.css'

const absolute = (url: string) => new URL(url, location.origin).href

export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const s = useUrlState()
  const { site } = useSite()
  const stats = useStats(open)
  const [ttl, setTtl] = useState<ShareTtl>('7d')
  const [hideRevenue, setHideRevenue] = useState(false)
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<string | null>(null)
  // Each opening, and each site, starts from the defaults. Adjusted during render, not in an effect.
  const ctx = `${open}|${s.site}`
  const [seenCtx, setSeenCtx] = useState(ctx)
  if (seenCtx !== ctx) {
    setSeenCtx(ctx)
    setTtl('7d')
    setHideRevenue(false)
    setMade(null)
  }
  const shares = useQuery('shares', (sig) => api.shares(sig), { enabled: open, staleMs: 0 })
  const state = viewState(s)
  const now = Date.now()
  const mine = (shares.data ?? []).filter((x: Share) => x.site === s.site && x.state === state && (x.expires == null || x.expires > now))
  const hasRevenue = !!site?.features.revenue
  const w = stats.data?.window
  const screen = SCREENS.find((r) => r.id === s.screen)?.label ?? 'Overview'
  const range = rangeLabel(s.range)[0]
  const filtersLabel = s.filters.length ? ` · ${s.filters.length} ${s.filters.length === 1 ? 'filter' : 'filters'}` : ''

  const create = async () => {
    setBusy(true)
    try {
      const sh = await createShare({ site: s.site, label: `${range}${filtersLabel}${hideRevenue ? ' · no revenue' : ''}`, state, hideRevenue, ttl })
      const url = sh.url ? absolute(sh.url) : null
      setMade(url)
      if (url) void navigator.clipboard?.writeText(url).catch(() => undefined)
      invalidate('shares')
      shares.refetch()
      toast(`Link copied · read-only · ${expiresText(sh.expires, Date.now())}`, { tone: 'good' })
    } catch (e) {
      writeFailed(e)
    } finally {
      setBusy(false)
    }
  }
  const revoke = async (id: string) => {
    try {
      await api.deleteShare(id)
      invalidate('shares')
      shares.refetch()
      toast('Link revoked. It stops working now.', { tone: 'good' })
    } catch (e) {
      writeFailed(e)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setMade(null)
        onOpenChange(o)
      }}
      title="Share a read-only link"
    >
      <p className="share-intro">
        <Eye size={14} aria-hidden="true" />
        <span>
          <b>Anyone with the link</b> can open this view, read-only. It includes:
        </span>
      </p>
      <dl className="kv">
        <dt>Site</dt>
        <dd>{s.site === 'all' ? 'All websites' : (site?.domain ?? s.site)}</dd>
        <dt>Screen</dt>
        <dd>{screen}, and the other screens of this site</dd>
        <dt>Range</dt>
        <dd>{w ? `${range} (${fmtRange(w.from, w.to, w.tz)})` : range}</dd>
        <dt>Comparison</dt>
        <dd>{s.cmp === 'none' ? 'Off' : (w?.basis.text ?? 'The previous period')}</dd>
        <dt>Filters</dt>
        <dd>
          {s.filters.length
            ? s.filters.map((f) => (
                <span key={`${f.dim}:${f.value}`} className="chip">
                  {DIM_LABEL[f.dim]} is {valueLabel(f.dim, f.value)}
                </span>
              ))
            : 'None'}
        </dd>
        <dt>Visitors</dt>
        <dd>Shown as “Visitor K7QD”. No IDs, no names from identify()</dd>
        {hasRevenue && (
          <>
            <dt>Revenue</dt>
            <dd>{hideRevenue ? 'Hidden everywhere' : 'Shown'}</dd>
          </>
        )}
      </dl>
      <p className="share-never">
        <Shield size={14} aria-hidden="true" />
        <span>Never included: visitor IDs and names, settings, other sites, saved views, API tokens. The viewer cannot remove filters or share it on.</span>
      </p>
      {hasRevenue && (
        <div className="form-row tight">
          <div className="l">
            <b>Hide revenue</b>
          </div>
          <div className="set-acts">
            <Switch checked={hideRevenue} onChange={setHideRevenue} label="Hide revenue" />
            <span className="muted">Removes the Revenue screen, KPI and columns</span>
          </div>
        </div>
      )}
      <div className="form-row tight">
        <div className="l">
          <b>Expires after</b>
        </div>
        <div>
          <Segmented value={ttl} onValueChange={(v) => setTtl(v as ShareTtl)} items={SHARE_TTLS.map((t) => ({ value: t.value, label: t.label }))} ariaLabel="Expires after" />
        </div>
      </div>
      <div className="set-acts" style={{ margin: '12px 0 4px' }}>
        <Button variant="primary" onClick={() => void create()} disabled={busy || s.site === 'all'}>
          <Link2 size={14} aria-hidden="true" />
          Create and copy link
        </Button>
        {s.site === 'all' && <span className="muted">Pick one website to share.</span>}
      </div>
      {made && (
        <div className="share-new">
          <input className="input" readOnly value={made} aria-label="New share link" onFocus={(e) => e.currentTarget.select()} />
          <CopyButton text={made} label="Copy share link" />
        </div>
      )}
      {mine.length > 0 && (
        <div className="share-list">
          <h3>Active links to this view</h3>
          {mine.map((l) => (
            <div key={l.id} className="share-row">
              <span className="mono">…{l.id.slice(-6)}</span>
              <span className="muted">
                {l.label || range} · {expiresText(l.expires, now)}
              </span>
              <span className="spacer" />
              <Button size="sm" aria-label={`Revoke link …${l.id.slice(-6)}`} onClick={() => void revoke(l.id)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
