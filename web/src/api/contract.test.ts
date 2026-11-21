// Contract drift check (plan T-2). Every testdata/contract/*.json (written by B2 task 9 from the real Go structs) must
// carry the required keys of its §0.5 TypeScript type. The key lists come from types.ts itself, so a type change
// without a golden refresh (or the reverse) fails here. Files that do not exist yet are skipped, not failed.
import { describe, expect, it } from 'vitest'
import typesSource from './types.ts?raw'

const goldens = import.meta.glob('../../../testdata/contract/*.json', { eager: true, import: 'default' }) as Record<string, unknown>

/** Required top-level keys of `export interface Name`, following `extends`. */
export function requiredKeys(src: string, name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) return []
  seen.add(name)
  const m = new RegExp(`export interface ${name}(?:\\s+extends\\s+([\\w, ]+))?\\s*\\{`).exec(src)
  if (!m) return []
  const keys: string[] = []
  for (const parent of (m[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)) keys.push(...requiredKeys(src, parent, seen))
  let depth = 0
  let seg = ''
  const flush = () => {
    const k = /^\s*(\w+)(\??):/.exec(seg)
    if (k && !k[2]) keys.push(k[1])
    seg = ''
  }
  for (let i = m.index + m[0].length; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') {
      if (depth === 0) break
      depth--
    }
    if (depth === 0 && (ch === '\n' || ch === ';')) flush()
    else seg += ch
  }
  flush()
  return [...new Set(keys)]
}

/** golden file base name (without .json) -> [TS type, array?] */
const TYPE_OF: Record<string, [string, boolean]> = {
  stats: ['Stats', false], series: ['Series', false], changes: ['Changes', false], heatmap: ['Heatmap', false],
  live: ['Live', false], revenue: ['Revenue', false], crawlers: ['Crawlers', false], 'event-detail': ['EventDetail', false],
  'goal-detail': ['GoalDetail', false], paths: ['PathsReport', false], 'funnel-report': ['FunnelReport', false],
  sites: ['Site', true], 'sites-summary': ['SiteSummary', true], breakdown: ['Row', true], visitors: ['Person', true],
  sessions: ['SessionRow', true], journey: ['JourneySession', true], campaigns: ['Campaign', true], 'ai-referrals': ['AIReferral', true],
  events: ['EventRow', true], goals: ['Goal', true], 'goals-report': ['GoalRow', true], funnels: ['Funnel', true],
  dropoff: ['DropoffPerson', true], 'revenue-breakdown': ['RevenueRow', true], views: ['SavedView', true], notes: ['Note', true],
  status: ['SiteStatus', false], check: ['InstallCheck', false], config: ['Config', false], tokens: ['ApiToken', true],
  shares: ['Share', true], whoami: ['WhoAmI', false], 'share-meta': ['ShareMeta', false],
}

describe('requiredKeys', () => {
  it('reads required keys, skips optional ones and follows extends', () => {
    expect(requiredKeys(typesSource, 'Point')).toEqual(['t', 'v'])
    expect(requiredKeys(typesSource, 'Stats')).toEqual(expect.arrayContaining(['visitors', 'window', 'prev', 'botRequests', 'conv']))
    expect(requiredKeys(typesSource, 'Series')).not.toContain('extras')
    expect(requiredKeys(typesSource, 'NewToken')).toContain('token')
  })
})

describe('testdata/contract goldens', () => {
  const entries = Object.entries(goldens)
  it.skipIf(entries.length > 0)('has no goldens yet (B2 task 9 writes them)', () => {
    expect(entries).toHaveLength(0)
  })
  for (const [file, body] of entries) {
    const base = file.split('/').pop()!.replace(/\.json$/, '')
    const t = TYPE_OF[base]
    it(`${base} carries every required key`, () => {
      expect(t, `no TypeScript type mapped for ${base}.json: add it to TYPE_OF`).toBeTruthy()
      const [type, isArray] = t
      const keys = requiredKeys(typesSource, type)
      expect(keys.length).toBeGreaterThan(0)
      const sample = isArray ? (body as unknown[])[0] : body
      expect(sample, `${base}.json is empty`).toBeTruthy()
      for (const k of keys) expect(sample as object, `${type}.${k}`).toHaveProperty(k)
    })
  }
})
