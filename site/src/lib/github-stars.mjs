// Build-time GitHub star count, shared by the landing (Astro) and the docs (VitePress config).
// Never invents a number: any failure, or a count below STAR_MIN, renders the button as plain "Star".
import { STAR_MIN } from './nav.mjs'

/** @returns {Promise<number|null>} */
export async function fetchStars({ repo = 'karanjot786/trail', env = process.env, fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  if (env.TRAIL_STARS === 'off') return null
  if (/^\d+$/.test(env.TRAIL_STARS ?? '')) return Number(env.TRAIL_STARS)
  // A plain ref'd timer, not AbortSignal.timeout(): that timer is unref'd, so on Node 22 a fetch that only
  // settles on abort leaves an empty event loop and node --test cancels the test (and a build could exit early).
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
  try {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'trail-site-build' }
    if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
    const res = await fetchImpl(`https://api.github.com/repos/${repo}`, { headers, signal: ac.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const n = (await res.json())?.stargazers_count
    if (!Number.isInteger(n) || n < 0) throw new Error('no stargazers_count')
    return n
  } catch (e) {
    console.warn(`[github-stars] no star count (${e?.message ?? e}); the button reads "Star"`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

let memo
/** @returns {Promise<number|null>} memoised per process */
export function getStars() {
  return (memo ??= fetchStars())
}

/** @returns {string} '' for null, NaN, negative or below STAR_MIN; else Intl compact: 87 → '87', 1234 → '1.2K' */
export function formatStars(n, min = STAR_MIN) {
  if (!Number.isFinite(n) || n <= 0 || n < min) return ''
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}
