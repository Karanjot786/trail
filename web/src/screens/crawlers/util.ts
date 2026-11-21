// Small helpers shared by the AI visibility tabs.

/** "just now", "4 min ago", "3 h ago", "2 days ago". */
export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 48 * 3600) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} days ago`
}

/** "37 answer fetches per visit": a ratio between two steps of different units, never a percentage. */
export function perVisit(fetched: number | null, visited: number | null): string {
  if (fetched == null) return 'answer fetches per visit: not set up'
  if (!visited) return 'no visits yet'
  const r = fetched / visited
  const n = r >= 10 ? Math.round(r) : Math.round(r * 10) / 10
  return `${n.toLocaleString('en-US')} answer ${n === 1 ? 'fetch' : 'fetches'} per visit`
}

/** Two-letter monogram of a provider name. */
export const monogram = (s: string) =>
  s
    .split(/\s+/)
    .map((x) => x[0] ?? '')
    .join('')
    .slice(0, 2)
