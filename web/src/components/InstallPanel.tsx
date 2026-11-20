import { useEffect, useMemo, useState } from 'react'
import { AlertTriangleIcon, CheckIcon, CopyIcon } from 'lucide-react'
import { api, type SiteStatus } from '@/api'
import { snippets, statusText, type Snippet } from '@/install'
import { cn } from '@/lib/utils'
import { TabStrip } from './TabStrip'
import { Code } from './GoalDialog'

const POLL_MS = 3000

/** Install code for one site plus a live check that polls its status while the panel is open. */
export function InstallPanel({ site, onEditOrigins }: { site: string; onEditOrigins: () => void }) {
  const all = useMemo(() => snippets(site, location.origin), [site])
  const [tab, setTab] = useState<Snippet['key']>('script')
  const cur = all.find((s) => s.key === tab)!

  return (
    <div className="flex min-w-0 flex-col gap-4 border-t border-border px-4 py-4 sm:px-5">
      <LiveCheck site={site} onEditOrigins={onEditOrigins} />

      <div className="min-w-0">
        <div className="tabs-scroll -mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
          <div className="flex h-9 min-w-max border-b border-border">
            <TabStrip
              label="Install method"
              tabs={all.map((s) => ({ value: s.key, label: s.label }))}
              value={tab}
              onChange={setTab}
            />
          </div>
        </div>
        <CodeBlock key={cur.key} snippet={cur} />
      </div>

      <p className="text-pretty text-[13px] leading-5 text-subtle">
        Privacy: by default the tracker is private until consent, so nothing is stored in the visitor’s browser until you call{' '}
        <Code>consent(true)</Code>. Add <Code>data-mode="full"</Code> (or <Code>mode="full"</Code>) to keep an id from the first
        visit on sites that need no consent. The tracker skips <Code>localhost</Code> unless you add <Code>data-dev</Code>.
      </p>
    </div>
  )
}

function CodeBlock({ snippet }: { snippet: Snippet }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet.code)
      setCopied(true)
    } catch {
      /* clipboard blocked: the code is still selectable */
    }
  }

  return (
    <div className="relative mt-3 rounded-xl border border-border bg-black">
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border pl-3.5 pr-1.5">
        <span className="truncate font-mono text-[12px] text-subtle">{snippet.file ?? snippet.label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="pressable relative grid size-8 shrink-0 place-items-center rounded-md text-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* Both icons stay mounted and cross-fade, so the swap can reverse mid-flight. */}
          <CopyIcon className={cn('icon-swap absolute size-4', copied && 'icon-out')} strokeWidth={1.5} aria-hidden />
          <CheckIcon className={cn('icon-swap absolute size-4 text-good', !copied && 'icon-out')} strokeWidth={2} aria-hidden />
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Copied to clipboard' : ''}
        </span>
      </div>
      <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap p-3.5 font-mono text-[12.5px] leading-[1.6] [overflow-wrap:anywhere] text-fg">
        <code>{snippet.code}</code>
      </pre>
    </div>
  )
}

function LiveCheck({ site, onEditOrigins }: { site: string; onEditOrigins: () => void }) {
  const [status, setStatus] = useState<SiteStatus | null>(null)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    let ctl = new AbortController()
    const poll = () => {
      ctl.abort()
      ctl = new AbortController()
      api
        .siteStatus(site, ctl.signal)
        .then((s) => {
          setStatus(s)
          setNow(Date.now())
        })
        .catch(() => {}) // keep the last known status; the next poll retries
    }
    poll()
    const p = setInterval(poll, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000) // "4s ago" keeps counting between polls
    return () => {
      ctl.abort()
      clearInterval(p)
      clearInterval(tick)
    }
  }, [site])

  if (!status) return <div className="h-10" aria-hidden />
  const st = statusText(status, now)
  const receiving = st.state === 'receiving'

  return (
    <div className="flex flex-col gap-2">
      <div
        role="status"
        className={cn(
          'flex min-h-10 items-center gap-2.5 rounded-lg border px-3 py-2 text-sm',
          receiving ? 'border-good/25 bg-good-bg text-fg' : 'border-border bg-raised text-muted',
        )}
      >
        {/* key: the state swap replays the enter; the text inside updates in place every second */}
        <span key={st.state} className="status-in flex min-w-0 items-center gap-2.5">
          {receiving ? (
            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-good text-black">
              <CheckIcon className="size-3" strokeWidth={3} aria-hidden />
            </span>
          ) : (
            <span className="wait-dot size-2 shrink-0 rounded-full bg-muted" aria-hidden />
          )}
          <span className="num min-w-0 truncate">{st.text}</span>
        </span>
      </div>
      {st.warning && (
        <div className="status-in flex items-start gap-2.5 rounded-lg border border-[#5a4512] bg-[#1f1806] px-3 py-2 text-sm text-[#f5c451]">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <p className="min-w-0 text-pretty leading-5">
            {st.warning}.{' '}
            <button
              type="button"
              onClick={onEditOrigins}
              className="font-medium text-fg underline decoration-[#f5c451]/50 underline-offset-2 outline-none hover:decoration-fg focus-visible:ring-2 focus-visible:ring-ring"
            >
              Edit allowed origins
            </button>
          </p>
        </div>
      )}
    </div>
  )
}
