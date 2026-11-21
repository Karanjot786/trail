// Settings → Install (plan F5-2): one install state for the status line, the test visit and the checklist,
// all read from GET /api/sites/{id}/check. A test visit opens the site and polls the check every 2 s for 60 s.
import { useEffect, useState } from 'react'
import { Activity, Copy, Terminal } from 'lucide-react'
import { api } from '../../api/client'
import { useQuery } from '../../api/useQuery'
import { FRAMEWORKS, installStatus, snippet, testVisitArrived, type FrameworkKey } from '../../lib/install'
import { useSite } from '../../shell/useSite'
import { useDataMode } from '../../shell/useDataMode'
import { RouteLink } from '../../shell/RouteLink'
import { announce } from '../../shell/announce'
import { useUrlState } from '../../state/useUrlState'
import { Button } from '../../ui/button'
import { CodeBlock, CopyButton } from '../../ui/code'
import { EmptyState, ErrorState } from '../../ui/states'
import { Tabs } from '../../ui/tabs'
import { toast } from '../../ui/toast'
import { Checklist } from './Checklist'
import { Card } from './parts'

const POLL_MS = 2_000
const TEST_MS = 60_000
type Test = { before: number | null; until: number } | { result: 'ok' | 'timeout' } | null

export default function Install() {
  const s = useUrlState()
  const { site } = useSite()
  const { mode } = useDataMode()
  const [fw, setFw] = useState<FrameworkKey>('html')
  const [test, setTest] = useState<Test>(null)
  const id = site?.id ?? ''
  const live = mode === 'http'
  const testing = !!test && 'until' in test
  const check = useQuery(`install-check|${id}`, (sig) => api.siteCheck(id, sig), { enabled: !!id && live, staleMs: 0, pollMs: testing ? POLL_MS : undefined })

  useEffect(() => setTest(null), [id])
  useEffect(() => {
    if (!test || !('until' in test)) return
    if (testVisitArrived(test.before, check.data)) {
      setTest({ result: 'ok' })
      toast(`Test visit received from ${site?.domain}`, { tone: 'good' })
      announce('Test visit received. Watch it live.')
      return
    }
    const t = window.setTimeout(() => {
      setTest({ result: 'timeout' })
      check.refetch()
      announce('No test visit arrived in 60 seconds. See the checks for the reason.')
    }, Math.max(0, test.until - Date.now()))
    return () => window.clearTimeout(t)
  }, [test, check.data, check, site?.domain])

  if (s.site === 'all' || !site) return <EmptyState title="Pick a website" body="Install code is per website. Choose one in the site switcher." />

  const host = location.origin
  const snip = snippet(fw, site.id, host)
  const st = installStatus(check.data)
  const sendTest = () => {
    window.open(`https://${site.domain}/`, '_blank', 'noopener')
    setTest({ before: check.data?.lastEventAt ?? null, until: Date.now() + TEST_MS })
    check.refetch()
    toast(`Opened ${site.domain} in a new tab. Waiting for the visit…`)
  }
  const ok = test && 'result' in test && test.result === 'ok'
  const title = ok ? 'Test visit received' : st.title
  const body = !live
    ? 'The demo is read-only: install checks run on your own Trail server.'
    : testing
      ? `Waiting for the visit from ${site.domain}. This checks every 2 seconds for a minute.`
      : ok
        ? 'It is in Live now. The checks below ran again.'
        : test && 'result' in test
          ? 'No visit arrived in 60 seconds. The checks below say why.'
          : st.tone === 'ok'
            ? 'Everything looks healthy.'
            : st.tone === 'bad'
              ? `${check.data?.lastEventAt == null ? 'Not receiving events yet. ' : ''}The fix is in the checklist below.`
              : `This updates by itself once the snippet is live. Load any page of ${site.domain}, or send a test visit.`

  return (
    <>
      <Card
        icon={Terminal}
        title={`Install on ${site.domain}`}
        sub="One script, about 2 KB, no cookies. Your host and site ID are filled in."
        actions={
          <Button
            size="sm"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(
                  `Add Trail analytics to this project. Load ${host}/_t/t.js with defer, data-site="${site.id}" and data-api="${host}/_t/e" on every page (in the root layout for frameworks). Do not add cookies or a consent banner; Trail needs neither.`,
                )
                .catch(() => undefined)
              toast('Prompt copied. Paste it into your AI assistant.', { tone: 'good' })
            }}
          >
            <Copy size={14} aria-hidden="true" />
            Copy prompt for your AI
          </Button>
        }
      >
        <div className="scard-b">
          <div className="install-state" data-tone={ok ? 'ok' : testing ? 'wait' : st.tone} data-testid="install-state" role="status">
            <span className="ind" aria-hidden="true" />
            <div className="txt">
              <b>
                {title}
                {(testing || (st.tone === 'wait' && !ok)) && (
                  <span className="waiting-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </b>
              <p>
                {body}
                {st.code && !ok && (
                  <>
                    {' '}
                    Reason code <code className="inl">{st.code}</code>.
                  </>
                )}
              </p>
            </div>
            {live &&
              (ok || (st.tone === 'ok' && !testing) ? (
                <RouteLink className="btn btn-sm" patch={{ screen: 'live', tab: '', site: site.id, filters: [], sheet: null }}>
                  <Activity size={14} aria-hidden="true" />
                  Watch it live
                </RouteLink>
              ) : st.tone === 'bad' && !testing ? (
                <Button size="sm" variant="primary" onClick={sendTest}>
                  I fixed it, test again
                </Button>
              ) : (
                <Button size="sm" variant="primary" onClick={sendTest} disabled={testing}>
                  Send a test visit
                </Button>
              ))}
          </div>
          <div className="set-ids">
            <span className="set-id">
              Site ID <span className="mono">{site.id}</span>
              <CopyButton text={site.id} label="Copy site ID" />
            </span>
            <span className="set-id">
              Endpoint <span className="mono">{host}/_t/e</span>
              <CopyButton text={`${host}/_t/e`} label="Copy endpoint" />
            </span>
          </div>
          <Tabs value={fw} onValueChange={(v) => setFw(v as FrameworkKey)} items={FRAMEWORKS.map((f) => ({ value: f.key, label: f.label }))} ariaLabel="Framework" />
          <p className="set-where">{snip.where}</p>
          <CodeBlock code={snip.code} filename={snip.filename} />
          <p className="method">
            Pages on localhost are ignored unless the snippet has <code className="inl">data-dev</code>; those events are tagged “development” so they can be filtered out.
          </p>
        </div>
      </Card>
      {live &&
        (check.error && !check.data ? (
          <ErrorState onRetry={check.refetch} message="Could not run the install checks." />
        ) : (
          <Checklist check={check.data} busy={check.loading} onRerun={check.refetch} />
        ))}
    </>
  )
}
