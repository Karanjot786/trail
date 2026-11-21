// Conversions → Funnels (Task F4-3): pick a funnel (links, so Back works), create, edit or delete one, and
// read its steps. /conversions/funnels shows the first funnel.
import { useState } from 'react'
import { Funnel as FunnelIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import type { Funnel } from '../../api/types'
import { invalidate, useQuery } from '../../api/useQuery'
import { RouteLink } from '../../shell/RouteLink'
import { navigate, useUrlState } from '../../state/useUrlState'
import { writeFailed } from '../../shell/writes'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { FunnelDetail } from './FunnelDetail'
import { FunnelDialog } from './FunnelDialog'
import { StaleState } from './kit'

export function useFunnels() {
  const s = useUrlState()
  return useQuery<Funnel[]>(`f4|funnels|${s.site}|${s.prefix}`, (sig) => api.funnels(s.site, sig), { enabled: !!s.site && s.site !== 'all' })
}

export function Funnels({ id, share }: { id: number | null; share: boolean }) {
  const s = useUrlState()
  const list = useFunnels()
  const [dialog, setDialog] = useState<'new' | 'edit' | null>(null)
  const [deleting, setDeleting] = useState(false)

  if (list.error && !list.data) return <ErrorState onRetry={list.refetch} />
  if (!list.data) return <Skeleton height={240} />
  const funnels = list.data
  const staleSheet = s.sheet?.kind === 'dropoff' && !funnels.some((f) => f.id === (s.sheet as { funnel: number }).funnel)
  const cur = id != null ? (funnels.find((f) => f.id === id) ?? null) : (funnels[0] ?? null)

  const remove = async () => {
    if (!cur) return
    try {
      await api.deleteFunnel(s.site, cur.id)
      invalidate('f4|')
      setDeleting(false)
      navigate({ screen: 'conversions', tab: 'funnels', id: null, sheet: null })
    } catch (e) {
      writeFailed(e)
    }
  }

  return (
    <>
      {staleSheet && <StaleState title="The funnel in this link no longer exists" back={{ sheet: null, id: null }} backLabel="Back to all funnels" />}
      {funnels.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No funnels yet"
            body="A funnel is an ordered list of pages or events, like /docs then /pricing then Signup. Trail counts who made it through each step within a time window, and who dropped off."
            action={
              !share && (
                <Button variant="primary" size="sm" onClick={() => setDialog('new')}>
                  <Plus size={14} aria-hidden="true" />
                  Create a funnel
                </Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="funnel-pick">
            <nav className="seg" aria-label="Funnels">
              {funnels.map((f) => (
                <RouteLink
                  key={f.id}
                  patch={{ screen: 'conversions', tab: 'funnels', id: f.id, sheet: null }}
                  aria-current={cur?.id === f.id ? 'page' : undefined}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-small no-underline"
                  style={cur?.id === f.id ? { background: 'var(--surface)', color: 'var(--fg)', boxShadow: '0 0 0 1px var(--border-strong)' } : { color: 'var(--muted)' }}
                >
                  <FunnelIcon size={14} aria-hidden="true" />
                  {f.name}
                </RouteLink>
              ))}
            </nav>
            <span className="flex-1" />
            {!share && (
              <>
                {cur && (
                  <>
                    <Button size="sm" onClick={() => setDialog('edit')} aria-label={`Edit ${cur.name}`}>
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(true)} aria-label={`Delete ${cur.name}`}>
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  </>
                )}
                <Button size="sm" onClick={() => setDialog('new')}>
                  <Plus size={14} aria-hidden="true" />
                  New funnel
                </Button>
              </>
            )}
          </div>
          {cur ? (
            <FunnelDetail id={cur.id} />
          ) : (
            <StaleState title="This funnel no longer exists" back={{ screen: 'conversions', tab: 'funnels', id: null, sheet: null }} backLabel="Back to all funnels" />
          )}
        </>
      )}
      {!share && (
        <>
          <FunnelDialog
            open={dialog != null}
            onOpenChange={(o) => !o && setDialog(null)}
            site={s.site}
            funnel={dialog === 'edit' ? cur : null}
            onSaved={(f) => navigate({ screen: 'conversions', tab: 'funnels', id: f.id, sheet: null })}
          />
          <Dialog open={deleting} onOpenChange={setDeleting} title={`Delete ${cur?.name ?? 'funnel'}?`} description="Only the funnel definition goes away; the events it counted stay." size="sm">
            <div className="f4-acts">
              <Button onClick={() => setDeleting(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove()}>
                Delete funnel
              </Button>
            </div>
          </Dialog>
        </>
      )}
    </>
  )
}
