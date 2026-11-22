// First-run onboarding: which step to show, the domain rules of step 1, and the "I'll do this later" memory.
// Pure, apart from the skip memory, which lives in localStorage (a per-browser convenience, never required).
import type { Site } from '../api/types'
import { normalizeDomain, suggestId } from './install'

export const STEPS = ['site', 'install', 'verify', 'done'] as const
export type Step = (typeof STEPS)[number]
export const STEP_LABEL: Record<Step, string> = { site: 'Add your website', install: 'Install', verify: 'Verify', done: 'Done' }

// The server's own host rule (internal/sites reHost), plus at least one dot so "localhost" or "example" is caught here.
const HOST = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export type DomainCheck = { ok: true; domain: string; wildcard: boolean } | { ok: false; domain: string; error: string }

/** A pasted URL, host or *.host → the site's domain. A leading *. is dropped: a site's subdomains are always allowed. */
export function checkDomain(input: string): DomainCheck {
  let d = normalizeDomain(input)
  const wildcard = d.startsWith('*.')
  if (wildcard) d = d.slice(2)
  if (!d) return { ok: false, domain: d, error: 'Enter your website’s domain, like example.com.' }
  if (d.length > 253 || !HOST.test(d)) return { ok: false, domain: d, error: 'Enter a domain like example.com or blog.example.com, without spaces.' }
  if (!/[a-z]/.test(d.slice(d.lastIndexOf('.') + 1))) return { ok: false, domain: d, error: 'Enter a domain name, not an IP address.' }
  return { ok: true, domain: d, wildcard }
}

const RE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/
/** The site id to suggest for a domain: www.example.com → example. */
export const idFor = (domain: string) => suggestId(domain) || ''
export function checkId(id: string): string | null {
  if (!id) return 'Give the site an ID.'
  return RE_ID.test(id) ? null : 'Use up to 40 lowercase letters, digits and dashes, starting with a letter or digit.'
}

export interface Where {
  prefix: string
  screen: string
  site: string
  /** The dashboard is reading recorded data (the demo build). */
  fixtures: boolean
}

/**
 * Where onboarding should take the person, or null to leave them where they are.
 * - No sites at all: step 1.
 * - The Overview of a site that has never received an event: step 2 for that site.
 * The demo, share links, other screens and skipped sites never redirect.
 */
export function onboardingRedirect(w: Where, sites: Site[] | undefined, skipped: (site: string) => boolean): { tab: Step; site: string } | null {
  if (w.prefix !== '' || w.fixtures || !sites || w.screen === 'welcome') return null
  if (sites.length === 0) return skipped('*') ? null : { tab: 'site', site: '' }
  if (w.screen !== 'overview' || !w.site || w.site === 'all') return null
  const site = sites.find((x) => x.id === w.site)
  if (!site || site.lastEventAt != null || skipped(site.id)) return null
  return { tab: 'install', site: site.id }
}

/** The step a URL may show: later steps need a site, and Done needs one that has received data. */
export function allowedStep(tab: string, site: Site | null): Step {
  const t = (STEPS as readonly string[]).includes(tab) ? (tab as Step) : 'site'
  if (t === 'site' || !site) return 'site'
  if (t === 'done' && site.lastEventAt == null) return 'verify'
  return t
}

const KEY = 'trail.onboarding.skipped'
function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
/** "I'll do this later" for one site, or '*' for an instance with no sites yet. */
export function skip(site: string): void {
  try {
    const all = read()
    if (!all.includes(site)) localStorage.setItem(KEY, JSON.stringify([...all, site].slice(-50)))
  } catch {
    /* storage blocked: onboarding just shows again next time */
  }
}
export function isSkipped(site: string): boolean {
  return read().includes(site)
}
export function unskip(site: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(read().filter((x) => x !== site && x !== '*')))
  } catch {
    /* ignore */
  }
}
