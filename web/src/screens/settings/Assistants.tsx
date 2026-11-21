// Settings → AI assistants (plan F5-3): pick a client, create a site-scoped token inline, paste the setup with the
// token filled in, and test the connection with that token through /api/v1/whoami.
import { useState } from 'react'
import { Check, Plug, X, Zap } from 'lucide-react'
import type { NewToken } from '../../api/types'
import { useSite } from '../../shell/useSite'
import { useDataMode } from '../../shell/useDataMode'
import { announce } from '../../shell/announce'
import { useUrlState } from '../../state/useUrlState'
import { Button } from '../../ui/button'
import { CodeBlock, CopyButton } from '../../ui/code'
import { Tabs } from '../../ui/tabs'
import { MCP_CLIENTS, mcpSetup, scopeText, type McpClient } from './model'
import { Card } from './parts'
import { testToken } from './remote'
import { TokenForm } from './TokenForm'

type Result = { tone: 'ok' | 'bad' | 'wait'; lead: string; text: string } | null

const TOOLS: [string, string][] = [
  ['list_sites', 'The sites this token can read'],
  ['what_changed', 'The few biggest changes against the comparison period: a good first call'],
  ['get_stats', 'Visitors, page views, sessions, bounce, conversions and revenue, with the previous period'],
  ['get_breakdown', 'Top pages, sources, channels, countries, devices or events'],
  ['get_series', 'One metric per day or hour'],
  ['get_journey', 'One person’s full journey across visits'],
  ['get_funnel', 'People reaching each funnel step, and the biggest drop'],
  ['get_live', 'Who is on the site right now'],
  ['add_note', 'Add a chart note, with a notes token'],
]

export default function Assistants() {
  const { site: current } = useUrlState()
  const { sites } = useSite()
  const { mode } = useDataMode()
  const [client, setClient] = useState<McpClient>('desktop')
  const [token, setToken] = useState<NewToken | null>(null)
  const [result, setResult] = useState<Result>(null)
  const url = `${location.origin}/mcp`
  const setup = mcpSetup(client, url, token?.token ?? null)
  const label = MCP_CLIENTS.find((c) => c.key === client)!.label
  const domainOf = (id: string | null) => (id ? (sites.find((x) => x.id === id)?.domain ?? id) : null)

  const runTest = async () => {
    if (!token) {
      setResult({ tone: 'bad', lead: 'Not connected: no token yet.', text: 'Create one in step 2, then test again.' })
      announce('Not connected: no token yet')
      return
    }
    setResult({ tone: 'wait', lead: 'Testing…', text: 'Calling Trail with this token.' })
    const r = await testToken(token.token)
    if (r.ok) {
      const where = domainOf(r.who.site) ?? 'every site'
      setResult({ tone: 'ok', lead: 'Connected.', text: `Trail answered in ${r.ms} ms for ${where}. Your assistant can use Trail now.` })
      announce('Connected')
    } else if (r.status === 401) {
      setResult({
        tone: 'bad',
        lead: 'Not connected: 401 token_invalid.',
        text: 'The server rejected this token (revoked, or copied with a missing character). Create a new token in step 2 and test again.',
      })
      announce('Not connected: the token was rejected')
    } else {
      setResult({
        tone: 'bad',
        lead: r.status ? `Not connected: ${r.status}.` : 'Not connected: no answer.',
        text: r.status === 403 ? 'This token may not read that site. Create one for the right site in step 2.' : 'Check that the server is running, then test again.',
      })
    }
  }

  return (
    <>
      <Card icon={Plug} title="Connect an AI assistant" sub="Ask questions about your traffic in plain words. Read-only by default: assistants never change settings or delete data.">
        <div className="scard-b">
          <ol className="steps-ol">
            <li>
              <h3>Pick your assistant</h3>
              <Tabs
                value={client}
                onValueChange={(v) => {
                  setClient(v as McpClient)
                  setResult(null)
                }}
                items={MCP_CLIENTS.map((c) => ({ value: c.key, label: c.label }))}
                ariaLabel="Assistant"
              />
            </li>
            <li>
              <h3>Create a token for it</h3>
              <p>A token is a password just for this assistant. You can revoke it any time without touching anything else.</p>
              {token ? (
                <div className="install-state" data-tone="ok">
                  <span className="ind" aria-hidden="true" />
                  <div className="txt">
                    <b>Token “{token.name}” created</b>
                    <p>
                      {scopeText(token.scope, domainOf(token.site))}. Shown once; Trail keeps only its hash.{' '}
                      {client === 'desktop' ? 'Copy it now: Claude asks for it in step 3.' : 'It is filled in to the setup in step 3.'}
                    </p>
                    <CodeBlock code={token.token} />
                    <div className="set-acts" style={{ marginTop: 8 }}>
                      <Button size="sm" variant="ghost" onClick={() => (setToken(null), setResult(null))}>
                        Create another token
                      </Button>
                    </div>
                  </div>
                </div>
              ) : mode === 'fixtures' ? (
                <p className="muted">The demo is read-only, so it cannot create tokens. On your own Trail server this form makes one.</p>
              ) : (
                <TokenForm
                  key={client}
                  scopes={['read', 'notes']}
                  sites={sites}
                  current={current}
                  defaultName={`${label.replace(' / claude.ai', '')} on my laptop`}
                  onCreated={(t) => {
                    setToken(t)
                    setResult(null)
                    announce(`Token ${t.name} created and filled in`)
                  }}
                />
              )}
            </li>
            <li>
              <h3>{client === 'desktop' ? 'Add Trail as a connector' : 'Paste this'}</h3>
              <p>{setup.where}</p>
              <CodeBlock code={setup.code} filename={setup.filename} />
              {client === 'desktop' && (
                <dl className="kv" style={{ marginTop: 10 }}>
                  <dt>Connector URL</dt>
                  <dd>
                    <span className="mono">{url}</span>
                  </dd>
                  <dt>Token</dt>
                  <dd>
                    {token ? (
                      <>
                        <span className="mono">{token.prefix}…</span>
                        <CopyButton text={token.token} label="Copy token" />
                        <span className="muted">Paste it when Claude asks you to sign in.</span>
                      </>
                    ) : (
                      <span className="subtle">Create one in step 2</span>
                    )}
                  </dd>
                </dl>
              )}
              {!token && client !== 'desktop' && (
                <p className="method">
                  {client === 'code' ? <code className="inl">$TRAIL_TOKEN</code> : <code className="inl">{'${env:TRAIL_TOKEN}'}</code>} stands for your token. Create one in step 2 and it is
                  filled in here.
                </p>
              )}
            </li>
            <li>
              <h3>Test the connection</h3>
              <p>Trail calls its own API with this token, the way your assistant will.</p>
              <div className="set-test">
                <Button size="sm" onClick={() => void runTest()} disabled={result?.tone === 'wait'}>
                  <Plug size={14} aria-hidden="true" />
                  Test connection
                </Button>
                <span className="set-res" role="status" data-testid="mcp-result" data-tone={result?.tone}>
                  {result && (
                    <>
                      {result.tone === 'ok' ? <Check size={14} aria-hidden="true" /> : result.tone === 'bad' ? <X size={14} aria-hidden="true" /> : null}
                      <span>
                        <b>{result.lead}</b> {result.text}
                      </span>
                    </>
                  )}
                </span>
              </div>
            </li>
            <li>
              <h3>Ask something</h3>
              <p>“Which sources brought people who signed up this week?” · “What did people do before buying?”</p>
            </li>
          </ol>
          <details className="tech">
            <summary>Technical details</summary>
            <p>
              An MCP (Model Context Protocol) server over Streamable HTTP at <span className="mono">{url}</span>. Auth: <span className="mono">Authorization: Bearer &lt;token&gt;</span>.
              Tokens can also come from the <code className="inl">TRAIL_API_TOKENS</code> environment variable on the server; those read every site and are revoked there.
            </p>
          </details>
        </div>
      </Card>
      <Card icon={Zap} title="What it can ask Trail" sub="The main tools. Every tool respects the site and range you name, and the token’s site.">
        {TOOLS.map(([n, d]) => (
          <div key={n} className="srow">
            <span className="who">
              <b className="mono">{n}</b>
              <span>{d}</span>
            </span>
          </div>
        ))}
      </Card>
    </>
  )
}
