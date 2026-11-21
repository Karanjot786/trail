// Settings → API tokens (plan F5-4): every token with its scope and site, create any scope (shown once), revoke with
// a confirmation. Tokens from TRAIL_API_TOKENS are listed but revoked on the server, not here.
import { useState } from 'react'
import { KeyRound, Plus } from 'lucide-react'
import { api } from '../../api/client'
import type { ApiToken, NewToken } from '../../api/types'
import { invalidate, useQuery } from '../../api/useQuery'
import { useSite } from '../../shell/useSite'
import { useDataMode } from '../../shell/useDataMode'
import { writeFailed } from '../../shell/writes'
import { useUrlState } from '../../state/useUrlState'
import { Button } from '../../ui/button'
import { CodeBlock } from '../../ui/code'
import { Dialog } from '../../ui/dialog'
import { Badge } from '../../ui/small'
import { EmptyState, ErrorState, Skeleton } from '../../ui/states'
import { toast } from '../../ui/toast'
import { SCOPE_LABEL, scopeText } from './model'
import { ago, Card, fmtDate } from './parts'
import { TokenForm } from './TokenForm'

export default function Tokens() {
  const { site: current } = useUrlState()
  const { sites } = useSite()
  const { mode } = useDataMode()
  const tokens = useQuery('tokens', (sig) => api.tokens(sig), { enabled: mode === 'http' })
  const [form, setForm] = useState(false)
  const [fresh, setFresh] = useState<NewToken | null>(null)
  const [revoking, setRevoking] = useState<ApiToken | null>(null)
  const domainOf = (id: string | null) => (id ? (sites.find((x) => x.id === id)?.domain ?? id) : null)

  const revoke = async (t: ApiToken) => {
    try {
      await api.deleteToken(t.id)
      invalidate('tokens')
      tokens.refetch()
      if (fresh?.id === t.id) setFresh(null)
      toast(`Revoked “${t.name}”. Anything using it stops working now.`, { tone: 'good' })
      setRevoking(null)
    } catch (e) {
      writeFailed(e)
    }
  }

  if (mode === 'fixtures') return <EmptyState title="API tokens live on your own server" body="The demo is read-only, so it has no tokens. On your Trail server this page lists and creates them." />

  return (
    <Card
      icon={KeyRound}
      title="API tokens"
      sub="For scripts, dashboards, crawler logs and AI assistants. A token is shown once; Trail stores only its hash."
      actions={
        !form && (
          <Button variant="primary" onClick={() => (setForm(true), setFresh(null))}>
            <Plus size={14} aria-hidden="true" />
            New token
          </Button>
        )
      }
    >
      {form && (
        <div className="scard-b" style={{ borderBottom: '1px solid var(--border)' }}>
          <TokenForm
            scopes={['read', 'notes', 'write', 'crawl']}
            sites={sites}
            current={current}
            onCreated={(t) => {
              setForm(false)
              setFresh(t)
              tokens.refetch()
            }}
            onCancel={() => setForm(false)}
          />
        </div>
      )}
      {fresh && (
        <div className="scard-b" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="install-state" data-tone="ok" role="status">
            <span className="ind" aria-hidden="true" />
            <div className="txt">
              <b>Copy “{fresh.name}” now</b>
              <p>
                You will not see it again. {scopeText(fresh.scope, domainOf(fresh.site))}. In a terminal: <code className="inl">export TRAIL_TOKEN=…</code>
              </p>
              <CodeBlock code={fresh.token} />
              <div className="set-acts" style={{ marginTop: 8 }}>
                <Button size="sm" onClick={() => setFresh(null)}>
                  Done, I copied it
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {tokens.error && !tokens.data ? (
        <ErrorState onRetry={tokens.refetch} />
      ) : !tokens.data ? (
        <div className="scard-b">
          <Skeleton height={40} />
        </div>
      ) : tokens.data.length === 0 ? (
        <EmptyState title="No tokens yet" body="Create one for a script, a crawler log import or an AI assistant." />
      ) : (
        tokens.data.map((t) => (
          <div key={t.id} className="srow">
            <span className="ic" aria-hidden="true">
              <KeyRound size={14} aria-hidden="true" />
            </span>
            <span className="who">
              <b>{t.name}</b>
              <span>
                {t.prefix && <span className="mono">{t.prefix}… · </span>}
                {SCOPE_LABEL[t.scope]} · {domainOf(t.site) ?? 'all sites'}
                {!t.fromEnv && ` · created ${fmtDate(t.created)} · used ${ago(t.lastUsed)}`}
              </span>
            </span>
            <span className="spacer" />
            {t.fromEnv ? (
              <Badge>Set in TRAIL_API_TOKENS</Badge>
            ) : (
              <Button size="sm" aria-label={`Revoke ${t.name}`} onClick={() => setRevoking(t)}>
                Revoke
              </Button>
            )}
          </div>
        ))
      )}
      <Dialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)} title={revoking ? `Revoke “${revoking.name}”?` : 'Revoke token'} size="sm">
        <p className="muted">Scripts and assistants that use it stop working at once. This cannot be undone.</p>
        <div className="set-acts end" style={{ marginTop: 16 }}>
          <Button variant="ghost" onClick={() => setRevoking(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => revoking && void revoke(revoking)}>
            Revoke token
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}
