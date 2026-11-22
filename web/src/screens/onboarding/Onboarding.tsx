// First-run onboarding: add a website, install the script, verify the first event, then the Overview.
// Shown by App when the instance has no sites or the chosen site has never received an event, and from the site
// switcher's "Add a website". The step lives in the URL (/welcome/{site|install|verify|done}?site=), so a reload
// or a link resumes it. "I'll do this later" remembers the choice per site in this browser.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ArrowLeft, ArrowRight, Check, ExternalLink, KeyRound, Plus } from 'lucide-react'
import { api, HttpError } from '../../api/client'
import type { NewToken, Site } from '../../api/types'
import { invalidate, useQuery } from '../../api/useQuery'
import { snippet } from '../../lib/install'
import { allowedStep, checkDomain, checkId, idFor, skip, STEP_LABEL, unskip, type Step } from '../../lib/onboarding'
import { initCommand, tokenName } from '../crawlers/UnlockCard'
import { Checklist } from '../settings/Checklist'
import { Mark } from '../../shell/Mark'
import { RouteLink } from '../../shell/RouteLink'
import { announce } from '../../shell/announce'
import { useSitesQuery } from '../../shell/useSite'
import { writeFailed } from '../../shell/writes'
import { navigate, useUrlState } from '../../state/useUrlState'
import { Button } from '../../ui/button'
import { CodeBlock, CopyButton } from '../../ui/code'
import { Tabs } from '../../ui/tabs'
import { Toaster } from '../../ui/toast'
import '../settings/settings.css'
import './onboarding.css'

const SHOWN: Step[] = ['site', 'install', 'verify']
const SHORT: Record<Step, string> = { site: 'Website', install: 'Install', verify: 'Verify', done: 'Done' }
export const POLL_MS = 2_000
/** After this long with nothing, the verify step opens the install checks by itself. */
export const CHECKS_AFTER_MS = 30_000

const to = (tab: Step, site: string, replace = false) =>
  navigate({ screen: 'welcome', tab, site, id: null, filters: [], sheet: null }, { replace })

export default function Onboarding() {
  const s = useUrlState()
  const { sites } = useSitesQuery()
  // The site just created, until the refetched list knows it.
  const [created, setCreated] = useState<Site | null>(null)
  const list = sites.data ?? []
  // A first event seen by the verify step counts before the refetched site list says so.
  const [arrived, setArrived] = useState<Record<string, number>>({})
  const known = list.find((x) => x.id === s.site) ?? (created?.id === s.site ? created : null)
  const site = known && known.lastEventAt == null && arrived[known.id] ? { ...known, lastEventAt: arrived[known.id] } : known
  const step = allowedStep(s.tab, site)
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)

  // Keep the URL honest about the step it shows (a late step without a site goes back to step 1).
  useEffect(() => {
    if (s.screen === 'welcome' && sites.data && step !== s.tab) to(step, step === 'site' ? s.site : (site?.id ?? ''), true)
  }, [s.screen, sites.data, step, s.tab, s.site, site?.id])
  useEffect(() => {
    document.title = `${STEP_LABEL[step]} · Set up Trail`
    if (first.current) {
      first.current = false
      return
    }
    heading.current?.focus()
    announce(`Step: ${STEP_LABEL[step]}`)
  }, [step])

  const adding = step === 'site' && list.length > 0
  const later = () => {
    if (adding) {
      navigate({ screen: 'overview', tab: '', site: s.site && list.some((x) => x.id === s.site) ? s.site : list[0].id, filters: [], sheet: null })
      return
    }
    if (site) {
      skip(site.id)
      navigate({ screen: 'overview', tab: '', site: site.id, filters: [], sheet: null })
    } else {
      skip('*')
      navigate({ screen: 'settings', tab: 'sites', site: '', filters: [], sheet: null })
    }
  }

  return (
    <div className="onb">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="onb-top">
        <span className="auth-brand">
          <span className="auth-mark">
            <Mark />
          </span>
          Trail
        </span>
        <Button variant="ghost" size="sm" onClick={later}>
          {adding ? 'Cancel' : step === 'done' ? 'Close' : 'I’ll do this later'}
        </Button>
      </header>
      <main id="main" tabIndex={-1} className="onb-main">
        <ol className="onb-steps" aria-label="Setup steps">
          {SHOWN.map((k, i) => {
            const at = SHOWN.indexOf(step === 'done' ? 'verify' : step)
            const state = step === 'done' || i < at ? 'done' : i === at ? 'now' : 'next'
            return (
              <li key={k} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
                <span className="dot" aria-hidden="true">
                  {state === 'done' ? <Check size={12} strokeWidth={2.5} /> : i + 1}
                </span>
                <span className="lbl">
                  {SHORT[k]}
                  <span className="sr-only">{state === 'done' ? ', done' : state === 'next' ? ', not started' : ''}</span>
                </span>
              </li>
            )
          })}
        </ol>
        <section className="onb-card" aria-labelledby="onb-h">
          {step === 'site' && (
            <AddSite
              heading={heading}
              first={list.length === 0}
              onCreated={(x) => {
                setCreated(x)
                unskip(x.id)
                invalidate('sites')
                to('install', x.id)
              }}
            />
          )}
          {step === 'install' && site && <Install heading={heading} site={site} />}
          {step === 'verify' && site && (
            <Verify
              heading={heading}
              site={site}
              onArrived={(at) => {
                setArrived((a) => ({ ...a, [site.id]: at }))
                invalidate('sites')
                to('done', site.id, true)
              }}
            />
          )}
          {step === 'done' && site && <Done heading={heading} site={site} />}
        </section>
        {step === 'site' && list.length > 0 && (
          <p className="onb-foot">
            Already set up?{' '}
            <RouteLink patch={{ screen: 'overview', tab: '', site: list[0].id, filters: [], sheet: null }}>Open {list[0].domain}</RouteLink>
          </p>
        )}
      </main>
      <Toaster />
      <div id="live-region" className="sr-only" aria-live="polite" />
    </div>
  )
}

function Head({ heading, kicker, title, children }: { heading: RefObject<HTMLHeadingElement | null>; kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="onb-head">
      <p className="onb-kicker">{kicker}</p>
      <h1 id="onb-h" ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {children && <p className="onb-lead">{children}</p>}
    </div>
  )
}

function AddSite({ heading, first, onCreated }: { heading: RefObject<HTMLHeadingElement | null>; first: boolean; onCreated: (s: Site) => void }) {
  const [domain, setDomain] = useState('')
  const [id, setId] = useState('')
  const [idEdited, setIdEdited] = useState(false)
  const [err, setErr] = useState<{ field: 'domain' | 'id' | 'form'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const domainRef = useRef<HTMLInputElement>(null)
  const idRef = useRef<HTMLInputElement>(null)
  const d = checkDomain(domain)
  const sid = idEdited ? id : d.ok ? idFor(d.domain) : ''
  const preview = d.ok && domain.trim() !== d.domain ? `Saved as ${d.domain}` : ''

  const submit = async () => {
    if (!d.ok) {
      setErr({ field: 'domain', text: d.error })
      domainRef.current?.focus()
      return
    }
    const idErr = checkId(sid)
    if (idErr) {
      setErr({ field: 'id', text: idErr })
      idRef.current?.focus()
      return
    }
    setErr(null)
    setBusy(true)
    try {
      onCreated(await api.createSite({ id: sid, domain: d.domain, origins: [] }))
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        setErr({ field: 'id', text: `That ID is taken. Try ${sid}-2.` })
        idRef.current?.focus()
      } else if (e instanceof HttpError && e.status === 400) setErr({ field: 'form', text: e.message })
      else writeFailed(e)
    } finally {
      setBusy(false)
    }
  }

  const desc = (f: 'domain' | 'id', extra = '') => `onb-${f}-hint${extra}${err?.field === f ? ` onb-${f}-err` : ''}`
  return (
    <>
      <Head heading={heading} kicker={first ? 'Welcome to Trail' : 'New website'} title="Add your website">
        Tell Trail which site to count. Events from anywhere else are refused.
      </Head>
      <form
        className="set-form onb-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="set-field">
          <label htmlFor="onb-domain">Domain</label>
          <input
            ref={domainRef}
            id="onb-domain"
            className="input mono"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value)
              if (err?.field === 'domain') setErr(null)
            }}
            placeholder="example.com"
            autoComplete="url"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            aria-invalid={err?.field === 'domain' ? true : undefined}
            aria-describedby={desc('domain', preview ? ' onb-domain-preview' : '')}
          />
          <span id="onb-domain-hint" className="hint">
            Paste a URL if you like: https:// and the path are dropped. Subdomains count too.
          </span>
          <span id="onb-domain-preview" className="hint onb-preview" aria-live="polite">
            {preview}
          </span>
          {err?.field === 'domain' && (
            <span id="onb-domain-err" className="err" role="alert">
              {err.text}
            </span>
          )}
        </div>
        <div className="set-field">
          <label htmlFor="onb-id">Site ID</label>
          <input
            ref={idRef}
            id="onb-id"
            className="input mono"
            value={sid}
            onChange={(e) => {
              setIdEdited(true)
              setId(e.target.value.toLowerCase())
              if (err?.field === 'id') setErr(null)
            }}
            maxLength={40}
            placeholder="example"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={err?.field === 'id' ? true : undefined}
            aria-describedby={desc('id')}
          />
          <span id="onb-id-hint" className="hint">
            A short name for the site switcher and the snippet. Filled in from the domain.
          </span>
          {err?.field === 'id' && (
            <span id="onb-id-err" className="err" role="alert">
              {err.text}
            </span>
          )}
        </div>
        {err?.field === 'form' && (
          <p className="form-err" role="alert">
            {err.text}
          </p>
        )}
        <div className="onb-acts">
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy || undefined}>
            {busy ? 'Adding…' : 'Add website'}
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
        </div>
      </form>
    </>
  )
}

type Method = 'script' | 'next' | 'npm'
const METHODS: { value: Method; label: string }[] = [
  { value: 'script', label: 'Script tag' },
  { value: 'next', label: 'Next.js / Astro' },
  { value: 'npm', label: 'Other / npm' },
]

async function mintCrawlToken(domain: string, site: string): Promise<NewToken> {
  const name = tokenName(domain)
  try {
    return await api.createToken({ name, scope: 'crawl', site })
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) return api.createToken({ name: `${name} (2)`, scope: 'crawl', site })
    throw e
  }
}

function Install({ heading, site }: { heading: RefObject<HTMLHeadingElement | null>; site: Site }) {
  const [method, setMethod] = useState<Method>('script')
  const [token, setToken] = useState<NewToken | null>(null)
  const [busy, setBusy] = useState(false)
  const host = location.origin
  const tag = snippet('html', site.id, host)
  const npm = `// npm i trail-analytics
import { inject } from 'trail-analytics'

inject({ site: '${site.id}', src: '${host}/_t/t.js', api: '${host}/_t/e' })`

  const mint = async () => {
    setBusy(true)
    try {
      setToken(await mintCrawlToken(site.domain, site.id))
      invalidate('tokens')
      announce('Token created and filled in. Copy the command.')
    } catch (e) {
      writeFailed(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Head heading={heading} kicker={`Step 2 of 3 · ${site.domain}`} title="Install the script">
        About 2 KB, no cookies, no consent banner. Your server and site ID are already filled in.
      </Head>
      <div className="set-ids">
        <span className="set-id">
          Site ID <span className="mono">{site.id}</span>
          <CopyButton text={site.id} label="Copy site ID" />
        </span>
      </div>
      <Tabs value={method} onValueChange={(v) => setMethod(v as Method)} items={METHODS} ariaLabel="How to install" idBase="onb-m" />
      <div id={`onb-m-${method}-panel`} role="tabpanel" aria-labelledby={`onb-m-${method}`} className="onb-panel">
        {method === 'script' && (
          <>
            <p className="set-where">Paste it inside &lt;head&gt; on every page. Works with any site builder that lets you add code.</p>
            <CodeBlock code={tag.code} filename="index.html" />
          </>
        )}
        {method === 'next' && (
          <>
            <p className="set-where">
              Run this in your project folder. It adds the script to your root layout and also counts AI crawlers. It shows the changes and asks before writing.
            </p>
            {token ? (
              <>
                <CodeBlock code={initCommand(host, site.id, token.token)} filename="Terminal" />
                <p className="method">The token is shown once and only sends crawler logs for {site.domain}. Revoke it any time in Settings → API tokens.</p>
              </>
            ) : (
              <div className="onb-mint">
                <code className="mono">{initCommand(host, site.id, '<token>')}</code>
                <Button size="sm" variant="primary" onClick={() => void mint()} disabled={busy} aria-busy={busy || undefined}>
                  <KeyRound size={14} aria-hidden="true" />
                  {busy ? 'Creating…' : 'Create token and fill it in'}
                </Button>
              </div>
            )}
          </>
        )}
        {method === 'npm' && (
          <>
            <p className="set-where">For any bundler. Call it once when your app starts. Single-page navigation is tracked by itself.</p>
            <CodeBlock code={npm} filename="main.ts" />
            <p className="method">
              React, Vue, SvelteKit, WordPress and Hugo snippets are in{' '}
              <RouteLink patch={{ screen: 'settings', tab: 'install', site: site.id, filters: [], sheet: null }}>Settings → Install</RouteLink>.
            </p>
          </>
        )}
      </div>
      <p className="method">
        Testing on localhost? Add <code className="inl">data-dev</code> to the tag. Those visits are marked “development”.
      </p>
      <div className="onb-acts">
        <Button variant="ghost" onClick={() => to('site', site.id)}>
          <Plus size={14} aria-hidden="true" />
          Add a different site
        </Button>
        <Button variant="primary" onClick={() => to('verify', site.id)}>
          I’ve added it, check now
          <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </>
  )
}

function Verify({ heading, site, onArrived }: { heading: RefObject<HTMLHeadingElement | null>; site: Site; onArrived: (at: number) => void }) {
  const [since] = useState(() => Date.now())
  const [showChecks, setShowChecks] = useState(false)
  const status = useQuery(`site-status|${site.id}`, (sig) => api.siteStatus(site.id, sig), { staleMs: 0, pollMs: POLL_MS })
  const check = useQuery(`install-check|${site.id}`, (sig) => api.siteCheck(site.id, sig), { enabled: showChecks, staleMs: 0 })
  const at = status.data?.lastEventAt ?? null
  const done = useRef(onArrived)
  useEffect(() => {
    done.current = onArrived
  })

  useEffect(() => {
    if (at == null) return
    announce(`Receiving data from ${site.domain}.`)
    done.current(at)
  }, [at, site.domain])
  useEffect(() => {
    const t = window.setTimeout(() => setShowChecks(true), Math.max(0, since + CHECKS_AFTER_MS - Date.now()))
    return () => window.clearTimeout(t)
  }, [since])

  return (
    <>
      <Head heading={heading} kicker={`Step 3 of 3 · ${site.domain}`} title="Check that it works">
        Open any page of your site with the script on it. This page notices the visit within a few seconds.
      </Head>
      <div className="install-state onb-state" data-tone="wait" role="status" data-testid="onb-status">
        <span className="ind" aria-hidden="true" />
        <div className="txt">
          <b>
            Waiting for your first visit
            <span className="waiting-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </b>
          <p>Checking every 2 seconds. Ad blockers on your own browser can hide your visit; try another browser if nothing shows.</p>
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            window.open(`https://${site.domain}/`, '_blank', 'noopener')
            announce(`Opened ${site.domain} in a new tab.`)
          }}
        >
          <ExternalLink size={14} aria-hidden="true" />
          Send a test visit
        </Button>
      </div>
      {showChecks ? (
        <div className="onb-checks">
          <Checklist check={check.data} busy={check.loading} onRerun={check.refetch} note=" Fix the first failed check, then load your site again." />
        </div>
      ) : (
        <p className="method">
          Nothing yet?{' '}
          <button type="button" className="linkish" onClick={() => setShowChecks(true)}>
            Run the install checks
          </button>{' '}
          to see what is in the way.
        </p>
      )}
      <div className="onb-acts">
        <Button variant="ghost" onClick={() => to('install', site.id)}>
          <ArrowLeft size={14} aria-hidden="true" />
          Back to the code
        </Button>
      </div>
    </>
  )
}

function Done({ heading, site }: { heading: RefObject<HTMLHeadingElement | null>; site: Site }) {
  return (
    <>
      <div className="onb-done" aria-hidden="true">
        <Check size={22} strokeWidth={2.5} />
      </div>
      <Head heading={heading} kicker={site.domain} title="Receiving data">
        Trail counted the first visit to {site.domain}. Visitors, sources and pages fill in as people arrive.
      </Head>
      <div className="onb-acts">
        <Button variant="ghost" onClick={() => to('site', site.id)}>
          <Plus size={14} aria-hidden="true" />
          Add another website
        </Button>
        <Button variant="primary" autoFocus onClick={() => navigate({ screen: 'overview', tab: '', site: site.id, filters: [], sheet: null })}>
          Go to Overview
          <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </>
  )
}
