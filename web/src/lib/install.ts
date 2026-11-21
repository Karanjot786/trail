// Install snippets, the install state line and the domain helpers for Settings → Websites and Install.
// The status line, the test visit and the checklist all read one InstallCheck, so they never disagree.
import type { InstallCheck, ReasonCode } from '../api/types'

export type FrameworkKey = 'html' | 'next' | 'react' | 'astro' | 'vue' | 'svelte' | 'wordpress' | 'hugo'
export const FRAMEWORKS: { key: FrameworkKey; label: string }[] = [
  { key: 'html', label: 'HTML' },
  { key: 'next', label: 'Next.js' },
  { key: 'react', label: 'React / Vite' },
  { key: 'astro', label: 'Astro' },
  { key: 'vue', label: 'Vue / Nuxt' },
  { key: 'svelte', label: 'SvelteKit' },
  { key: 'wordpress', label: 'WordPress' },
  { key: 'hugo', label: 'Hugo / Jekyll' },
]

export interface Snippet {
  /** Where the code goes, in one sentence. */
  where: string
  filename?: string
  code: string
}

/** Install code for `site`, with the tracker served from the Trail server at `host` (the dashboard's origin). */
export function snippet(kind: FrameworkKey, site: string, host: string): Snippet {
  const o = host.replace(/\/+$/, '')
  const tag = `<script defer src="${o}/_t/t.js" data-site="${site}" data-api="${o}/_t/e"></script>`
  switch (kind) {
    case 'next':
      return {
        where: 'Install the package, then add the component to your root layout. Route changes are tracked by themselves.',
        filename: 'app/layout.tsx',
        code: `// npm i trail-analytics
import { Analytics } from 'trail-analytics/next'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics site="${site}" src="${o}/_t/t.js" api="${o}/_t/e" />
      </body>
    </html>
  )
}`,
      }
    case 'react':
      return {
        where: 'Install the package, then add the component once, near the root of your app.',
        filename: 'src/App.tsx',
        code: `// npm i trail-analytics
import { Analytics } from 'trail-analytics/react'

export function App() {
  return (
    <>
      <Analytics site="${site}" src="${o}/_t/t.js" api="${o}/_t/e" />
      {/* your app */}
    </>
  )
}`,
      }
    case 'astro':
      return { where: 'Put it in the <head> of your base layout. View transitions are tracked.', filename: 'src/layouts/Base.astro', code: `<head>\n  ${tag}\n</head>` }
    case 'vue':
      return {
        where: 'Vue: add it to index.html. Nuxt: add it to app.head in nuxt.config. Router navigation is picked up from the History API.',
        filename: 'nuxt.config.ts',
        code: `// Vue: paste into index.html, inside <head>
${tag}

// Nuxt
export default defineNuxtConfig({
  app: { head: { script: [{ src: '${o}/_t/t.js', defer: true, 'data-site': '${site}', 'data-api': '${o}/_t/e' }] } },
})`,
      }
    case 'svelte':
      return { where: 'Add it to src/app.html, inside %sveltekit.head%.', filename: 'src/app.html', code: `<head>\n  %sveltekit.head%\n  ${tag}\n</head>` }
    case 'wordpress':
      return {
        where: 'Appearance → Theme file editor → header.php, just before </head>. Any "insert headers" plugin works too.',
        filename: 'header.php',
        code: `<?php /* before </head> */ ?>\n${tag}`,
      }
    case 'hugo':
      return {
        where: 'Hugo: add it to layouts/partials/head.html. Jekyll: add it to _includes/head.html.',
        filename: 'layouts/partials/head.html',
        code: tag,
      }
    default:
      return { where: 'Add it inside <head> on every page.', filename: 'index.html', code: tag }
  }
}

export interface InstallStatus {
  tone: 'wait' | 'ok' | 'bad'
  title: string
  code: ReasonCode | null
}

/** The one-line install state, read from the same response as the checklist. */
export function installStatus(c: InstallCheck | undefined): InstallStatus {
  if (!c) return { tone: 'wait', title: 'Checking the install', code: null }
  if (c.state === 'receiving') return { tone: 'ok', title: 'Receiving data', code: null }
  if (c.state === 'blocked') {
    const bad = c.checks.find((x) => x.status === 'fail')
    return { tone: 'bad', title: `Blocked: ${bad ? bad.label : 'see the checks below'}`, code: bad?.code ?? null }
  }
  return { tone: 'wait', title: 'Waiting for first event', code: null }
}

/** A test visit has arrived once lastEventAt moves past the value seen when it was sent. */
export function testVisitArrived(before: number | null, c: InstallCheck | undefined): boolean {
  const at = c?.lastEventAt ?? null
  return at != null && (before == null || at > before)
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
const GENERIC = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'vercel', 'netlify', 'pages', 'github', 'fly', 'onrender', 'herokuapp'])

/** A site id suggestion from a name or a domain: www.example.com → example, "Marketing site" → marketing-site. */
export function suggestId(input: string): string {
  const labels = normalizeDomain(input)
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
