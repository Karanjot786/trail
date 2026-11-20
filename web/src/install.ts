// Install snippets and the live-check wording for the Settings → Install panel.

export interface Snippet {
  key: 'script' | 'npm' | 'next' | 'react' | 'vercel'
  label: string
  file?: string
  code: string
}

/** Install code for a site, served from the Trail server at `origin` (the dashboard's own location.origin). */
export function snippets(site: string, origin: string): Snippet[] {
  const o = origin.replace(/\/+$/, '')
  const rewrite = `${o}/_t/:p*`
  return [
    {
      key: 'script',
      label: 'Script tag',
      file: 'index.html',
      code: `<script defer src="${o}/_t/t.js" data-site="${site}" data-api="${o}/_t/e"></script>`,
    },
    {
      key: 'npm',
      label: 'npm',
      code: `npm i trail-analytics

import { inject, track } from 'trail-analytics'

inject({ site: '${site}', src: '${o}/_t/t.js', api: '${o}/_t/e' })
track('signup', { plan: 'pro' })`,
    },
    {
      key: 'next',
      label: 'Next.js',
      code: `// next.config.js: serve the tracker from your own domain
module.exports = {
  async rewrites() {
    return [{ source: '/_t/:p*', destination: '${rewrite}' }]
  },
}

// app/layout.tsx
import { Analytics } from 'trail-analytics/next'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics site="${site}" />
      </body>
    </html>
  )
}`,
    },
    {
      key: 'react',
      label: 'React',
      code: `import { Analytics } from 'trail-analytics/react'

export function App() {
  return (
    <>
      <Analytics site="${site}" src="${o}/_t/t.js" api="${o}/_t/e" />
      {/* your app */}
    </>
  )
}`,
    },
    {
      key: 'vercel',
      label: 'Vercel rewrite',
      file: 'vercel.json',
      code: JSON.stringify({ rewrites: [{ source: '/_t/:p*', destination: rewrite }] }, null, 2),
    },
  ]
}

export interface SiteStatus {
  lastEventAt: number | null
  events24h: number
  rejected24h: number
}

export interface StatusText {
  state: 'waiting' | 'receiving'
  text: string
  warning: string | undefined
}

export function statusText(s: SiteStatus, now: number): StatusText {
  const n = s.rejected24h
  const warning =
    n > 0
      ? `${n} ${n === 1 ? 'event was' : 'events were'} rejected because ${n === 1 ? 'it' : 'they'} came from a domain not on this site's list`
      : undefined
  if (s.lastEventAt == null) return { state: 'waiting', text: 'Waiting for the first event…', warning }
  return {
    state: 'receiving',
    text: `Receiving data · last event ${ago(now - s.lastEventAt)}`,
    warning,
  }
}

function ago(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 1) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** A pasted URL or host → bare lowercase hostname (no scheme, path, port or trailing dot). */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d*$/, '')
    .replace(/\.$/, '')
}

// Second-level labels and hosting platforms that say nothing about the site.
const GENERIC = new Set([
  'co',
  'com',
  'org',
  'net',
  'ac',
  'gov',
  'edu',
  'vercel',
  'netlify',
  'pages',
  'github',
  'fly',
  'onrender',
  'herokuapp',
])

/** A site id suggestion from a domain: www.example.com → example, docs.example.co.uk → docs-example. */
export function suggestId(domain: string): string {
  const labels = normalizeDomain(domain)
    .replace(/^www\./, '')
    .split('.')
    .filter(Boolean)
  if (labels.length > 1) labels.pop() // TLD
  if (labels.length > 1 && GENERIC.has(labels[labels.length - 1])) labels.pop()
  return labels
    .join('-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '')
}

/** Origins typed one per line or comma separated; pasted URLs become hosts. */
export function parseOrigins(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map(normalizeDomain)
    .filter(Boolean)
}
