// Settings → Sharing (plan F5-4): every active read-only link, for all sites, with Revoke.
import { Link2 } from 'lucide-react'
import { api } from '../../api/client'
import { invalidate, useQuery } from '../../api/useQuery'
import { useSite } from '../../shell/useSite'
import { useDataMode } from '../../shell/useDataMode'
import { writeFailed } from '../../shell/writes'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/small'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { toast } from '../../ui/toast'
import { expiresText } from './model'
import { ago, Card, fmtDate } from './parts'

export default function Sharing() {
  const { sites } = useSite()
  const { mode } = useDataMode()
  const shares = useQuery('shares', (sig) => api.shares(sig), { enabled: mode === 'http', staleMs: 0 })
  const now = Date.now()
  const list = (shares.data ?? []).filter((x) => x.expires == null || x.expires > now)

  if (mode === 'fixtures') return <EmptyState title="Share links live on your own server" body="The demo is read-only, so it has no share links." />

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
    <Card icon={Link2} title="Share links" sub="Read-only links to one site. Anyone with a link can open it until it expires or you revoke it.">
      {shares.error && !shares.data ? (
        <ErrorState onRetry={shares.refetch} />
      ) : !shares.data ? (
        <div className="scard-b">
          <Skeleton height={40} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="No share links yet" body="Open any screen and choose Share to make a read-only link of that view." />
      ) : (
        list.map((l) => (
          <div key={l.id} className="srow">
            <span className="who">
              <b>
                {sites.find((x) => x.id === l.site)?.domain ?? l.site} · {l.label || 'Read-only view'}
              </b>
              <span>
                <span className="mono">…{l.id.slice(-6)}</span> · created {fmtDate(l.created)} · {expiresText(l.expires, now)} · opened {ago(l.lastUsed, now)}
              </span>
            </span>
            <span className="spacer" />
            {l.hideRevenue && <Badge>No revenue</Badge>}
            <Button size="sm" aria-label={`Revoke link …${l.id.slice(-6)}`} onClick={() => void revoke(l.id)}>
              Revoke
            </Button>
          </div>
        ))
      )}
    </Card>
  )
}
