// Unlock AI crawlers (plan F-4): one command adds a server hook to a Next.js or Astro site. The button mints a
// site-bound crawl token, fills it into the command and copies it. The status row polls the setup endpoint
// every 10 s while nothing has arrived yet. "Other ways" keeps the log importers.
import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { api, HttpError } from '../../api/client'
import type { AISetup, NewToken } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import { useDataMode } from '../../shell/useDataMode'
import { useUrlState } from '../../state/useUrlState'
import { announce } from '../../shell/announce'
import { Button } from '../../ui/button'
import { CodeBlock } from '../../ui/code'
import { StatusDot } from '../../ui/small'
import { toast } from '../../ui/toast'
import { ago } from './util'
import { Setup } from './Setup'

export const SETUP_POLL_MS = 10_000

/** The setup status of one site; polls every 10 s while no crawl line has ever arrived. Call it once per screen. */
export function useAISetup(site: string) {
  const s = useUrlState()
  const key = `ai-setup|${site}|${s.prefix}`
  const [none, setNone] = useState(false)
  const r = useQuery<AISetup>(key, (sig) => api.aiSetup(site, sig), { enabled: !!site && site !== 'all', staleMs: 5_000, pollMs: none ? SETUP_POLL_MS : undefined })
  const isNone = r.data?.crawls.state === 'none'
  if (isNone !== none) setNone(isNone)
  return r
}

export const initCommand = (origin: string, site: string, token: string) => `npx trail-analytics@latest init --url ${origin} --site ${site} --token ${token}`

const pad = (n: number) => String(n).padStart(2, '0')
export function tokenName(domain: string, d = new Date()): string {
  return `crawl ${domain} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function mint(name: string, site: string): Promise<NewToken> {
  try {
    return await api.createToken({ name, scope: 'crawl', site })
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) return api.createToken({ name: `${name} (2)`, scope: 'crawl', site })
    throw e
  }
}

export function SetupStatus({ setup }: { setup: AISetup | undefined }) {
  const c = setup?.crawls
  if (!c) return <p className="ai-status" role="status" aria-busy="true" />
  return (
    <p className="ai-status" role="status">
      {c.state === 'receiving' ? (
        <>
          <StatusDot tone="ok" />
          <b>Receiving</b>
          {c.lastAt != null && <span>last crawler request {ago(c.lastAt)}</span>}
        </>
      ) : c.state === 'quiet' ? (
        <>
          <StatusDot tone="warn" />
          <b>Nothing in the last 24 hours</b>
          {c.lastAt != null && <span>last crawler request {ago(c.lastAt)}</span>}
        </>
      ) : (
        <>
          <StatusDot tone="off" />
          <b>Not receiving yet</b>
          <span>Crawlers visit irregularly; the first request can take hours.</span>
        </>
      )}
    </p>
  )
}

export function UnlockCard({ site, domain, setup }: { site: string; domain: string; setup: AISetup | undefined }) {
  const s = useUrlState()
  const { mode } = useDataMode()
  const readOnly = mode === 'fixtures' || s.prefix !== ''
  const [token, setToken] = useState<NewToken | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const origin = location.origin
  const cmd = initCommand(origin, site, token?.token ?? '<token>')

  const create = async () => {
    setBusy(true)
    setErr('')
    try {
      const t = await mint(tokenName(domain), site)
      setToken(t)
      const text = initCommand(origin, site, t.token)
      try {
        await navigator.clipboard.writeText(text)
        toast('Command copied', { tone: 'good' })
        announce('Crawl token created. The command with the token is copied.')
      } catch {
        announce('Crawl token created. Copy the command below.')
      }
    } catch (e) {
      setErr(e instanceof Error && e.message ? `Could not create the token: ${e.message}` : 'Could not create the token.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ai-unlock" aria-labelledby="ai-unlock-h">
      <div className="ai-unlock-h">
        <h2 id="ai-unlock-h">Unlock AI crawlers</h2>
        <p>AI crawlers never run your script. One command adds a server hook to Next.js or Astro that reports them to Trail.</p>
      </div>
      <div className="ai-unlock-b">
        <CodeBlock code={cmd} lang="sh" filename="terminal" />
        <div className="ai-unlock-acts">
          {!token && (
            <Button variant="primary" size="sm" disabled={readOnly || busy} aria-describedby={readOnly ? 'ai-unlock-ro' : undefined} onClick={() => void create()}>
              <KeyRound size={14} aria-hidden="true" />
              Create token and copy command
            </Button>
          )}
          {readOnly ? (
            <span id="ai-unlock-ro" className="muted">
              The demo is read-only, so it cannot create tokens. On your own Trail server this button makes one.
            </span>
          ) : token ? (
            <span className="muted">
              The token is shown once. Revoke it in Settings → API tokens.
            </span>
          ) : (
            <span className="muted">Creates a token that can only add crawler requests to {domain}.</span>
          )}
        </div>
        {err && (
          <p className="ai-err" role="alert">
            {err}
          </p>
        )}
        <SetupStatus setup={setup} />
        <details className="ai-other">
          <summary>Other ways (server logs, any proxy)</summary>
          <Setup site={site} origin={origin} />
        </details>
      </div>
    </section>
  )
}
