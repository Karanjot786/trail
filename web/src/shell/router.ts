// The History-API router (plan F1-2). The URL is the state: path + query parse into UrlState (state/url.ts),
// navigate() pushes one history entry per change (replace on request), Back undoes, popstate re-reads.
import type { RangeKey } from '../api/types'
import { parseUrl, serializeUrl, type UrlState } from '../state/url'

export type Patch = Partial<UrlState>

const listeners = new Set<() => void>()
let cacheKey = ''
let cache: { state: UrlState; invalidRange: string | null } | null = null
let started = false

function read() {
  const key = location.pathname + location.search
  if (!cache || key !== cacheKey) {
    const parsed = parseUrl(location.pathname, location.search)
    cacheKey = key
    cache = { state: parsed.state, invalidRange: parsed.invalidRange }
  }
  return cache
}

/** Legacy and unknown links: replace the URL with its canonical form, never push. Kept out of read() so that
 *  rendering (useSyncExternalStore's getSnapshot) never writes to history. */
function applyRedirect(): void {
  const key = location.pathname + location.search
  const { redirect } = parseUrl(location.pathname, location.search)
  if (redirect && redirect !== key) history.replaceState(history.state, '', redirect)
}

export function current(): UrlState {
  return read().state
}

/** The unknown `range=` value from the URL, if any (the header shows a visible note). */
export function invalidRange(): string | null {
  return read().invalidRange
}

const emit = () => listeners.forEach((f) => f())
const onPop = () => {
  applyRedirect()
  emit()
}

export function subscribe(f: () => void): () => void {
  if (!started) {
    started = true
    window.addEventListener('popstate', onPop)
  }
  listeners.add(f)
  return () => void listeners.delete(f)
}

/** Starts the router: applies a legacy redirect at once. Safe to call more than once. */
export function startRouter(): void {
  cache = null
  applyRedirect()
  read()
  if (!started) {
    started = true
    window.addEventListener('popstate', onPop)
  }
}

const DAY = 86_400_000
function isoDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** The length of a range in days, by the local calendar. Used only to decide whether a custom cmp still fits. */
export function rangeDays(r: RangeKey, now = new Date()): number {
  if (r === 'today' || r === 'yesterday' || r.startsWith('d:')) return 1
  if (r.startsWith('c:')) {
    const [a, b] = r.slice(2).split('~')
    return Math.abs(Math.round((isoDay(b) - isoDay(a)) / DAY)) + 1
  }
  switch (r) {
    case '7d':
      return 7
    case '30d':
      return 30
    case '90d':
      return 90
    case '12mo':
      return 365
    case 'wtd':
      return ((now.getDay() + 6) % 7) + 1
    case 'mtd':
      return now.getDate()
    case 'lastmonth':
      return new Date(now.getFullYear(), now.getMonth(), 0).getDate()
  }
  return 30
}

/** The state after applying a patch: rules shared by navigate() and linkTo(). */
export function applyPatch(cur: UrlState, patch: Patch): UrlState {
  const next: UrlState = { ...cur, ...patch }
  if (patch.screen && patch.screen !== cur.screen) {
    if (!('tab' in patch)) next.tab = ''
    if (!('id' in patch)) next.id = null
    if (!('sheet' in patch)) next.sheet = null
  }
  // A change of range drops a custom comparison when the new range has a different length.
  if (patch.range && patch.range !== cur.range && !('cmp' in patch) && cur.cmp.startsWith('c:')) {
    if (rangeDays(patch.range) !== rangeDays(cur.range)) next.cmp = 'prev'
  }
  return next
}

/** The URL for the current state with `patch` applied, for `<a href>`. */
export function linkTo(patch: Patch): string {
  return serializeUrl(applyPatch(current(), patch))
}

export function navigate(patch: Patch, opts: { replace?: boolean } = {}): void {
  const url = linkTo(patch)
  if (url === location.pathname + location.search) return
  if (opts.replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
  emit()
}

/** Follows an internal href (a saved view, a link) through the router. */
export function go(href: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState(null, '', href)
  else history.pushState(null, '', href)
  applyRedirect()
  emit()
}
