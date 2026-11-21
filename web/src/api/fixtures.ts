// The fixtures transport (plan §0.13, Task F1-8): serves recorded JSON from /demo-data with no server.
// index.json maps canonical fixture keys to files. Unrecorded combinations fall back, in order: drop filters
// beyond the first, drop all filters, cmp → prev, range → 30d, site → demo. A fallback answers with
// `x-trail-preset: 1` and the shell shows "The demo shows preset views…". Writes answer 403. Live is replayed.
import { fixtureKey, type Transport, type TransportResponse } from './transport'
import type { Live } from './types'
import { simulateLive } from './liveSim'
import { markPreset, setRecordedAt } from '../shell/useDataMode'
import { rangeLabel } from '../shell/labels'

export interface FixtureIndex {
  recordedAt: number
  now: number
  tz: string
  keys: Record<string, string>
}

const PAGING = ['limit', 'offset', 'sort', 'q']

/** The fallback chain for a request, exact first. Each step builds on the one before. */
export function fallbacks(params: URLSearchParams): URLSearchParams[] {
  const out: URLSearchParams[] = [new URLSearchParams(params)]
  let p = new URLSearchParams(params)
  const step = (f: (q: URLSearchParams) => void) => {
    const next = new URLSearchParams(p)
    f(next)
    if (next.toString() !== p.toString()) out.push(next)
    p = next
  }
  step((q) => {
    const fs = q.getAll('f')
    q.delete('f')
    if (fs[0]) q.append('f', fs[0])
  })
  step((q) => q.delete('f'))
  step((q) => {
    if (q.has('cmp')) q.set('cmp', 'prev')
  })
  step((q) => {
    if (q.has('range')) q.set('range', '30d')
  })
  step((q) => {
    if (q.has('site') && q.get('site') !== 'all') q.set('site', 'demo')
  })
  return out
}

function describe(p: URLSearchParams, asked: URLSearchParams): string {
  const range = p.get('range')
  const f = p.get('f')
  const r = range ? rangeLabel(range as never)[0].toLowerCase() : 'the default range'
  return `${r}${f ? ` filtered by ${f.replace(':', ' ')}` : ', with no filters'}${p.get('site') !== asked.get('site') ? ` on the ${p.get('site')} site` : ''}`
}

function envelope(raw: unknown): { status: number; body: unknown; headers: Record<string, string> } {
  if (raw && typeof raw === 'object' && 'body' in raw && 'status' in raw) {
    const e = raw as { status: number; body: unknown; headers?: Record<string, string> }
    return { status: e.status, body: e.body, headers: e.headers ?? {} }
  }
  return { status: 200, body: raw, headers: {} }
}

export function createFixtureTransport(base = '/demo-data', fetchImpl: typeof fetch = (...a) => fetch(...a)): Transport {
  let index: Promise<FixtureIndex> | null = null
  const files = new Map<string, Promise<unknown>>()
  const loadIndex = () =>
    (index ??= fetchImpl(`${base}/index.json`).then(async (r) => {
      if (!r.ok) throw new Error(`fixtures index: ${r.status}`)
      const idx = (await r.json()) as FixtureIndex
      setRecordedAt(idx.recordedAt ?? null)
      return idx
    }))
  const loadFile = (file: string, signal?: AbortSignal) => {
    let p = files.get(file)
    if (!p) {
      p = fetchImpl(`${base}/${file}.json`, { signal }).then((r) => {
        if (!r.ok) throw new Error(`fixture ${file}: ${r.status}`)
        return r.json()
      })
      p.catch(() => files.delete(file))
      files.set(file, p)
    }
    return p
  }

  return {
    mode: 'fixtures',
    async get(path, params, signal): Promise<TransportResponse> {
      let idx: FixtureIndex
      try {
        idx = await loadIndex()
      } catch {
        index = null
        return { status: 503, body: 'The demo data is not available.', headers: {} }
      }
      // Paging and search are applied here; the recording holds the full list.
      const paging = new URLSearchParams()
      const core = new URLSearchParams()
      for (const [k, v] of params) (PAGING.includes(k) ? paging : core).append(k, v)
      const tries = fallbacks(core)
      for (let i = 0; i < tries.length; i++) {
        const candidates = [fixtureKey(path, tries[i])]
        if (i === 0 && [...paging].length) candidates.unshift(fixtureKey(path, params))
        for (const key of candidates) {
          const file = idx.keys[key]
          if (!file) continue
          const res = envelope(await loadFile(file, signal))
          const headers: Record<string, string> = { 'content-type': 'application/json', ...res.headers }
          let body = res.body
          if (path === '/live' && body && typeof body === 'object' && 'stream' in body) body = simulateLive(body as Live, Date.now())
          if (Array.isArray(body) && key !== fixtureKey(path, params)) {
            const q = (paging.get('q') ?? '').toLowerCase()
            let rows = q ? body.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : body
            headers['x-total-count'] = String(rows.length)
            const off = Number(paging.get('offset') ?? 0) || 0
            const lim = Number(paging.get('limit') ?? 0) || rows.length
            rows = rows.slice(off, off + lim)
            body = rows
          } else if (Array.isArray(body) && headers['x-total-count'] == null) headers['x-total-count'] = String(body.length)
          if (i > 0) {
            headers['x-trail-preset'] = '1'
            markPreset(describe(tries[i], core))
          }
          return { status: res.status, body, headers }
        }
      }
      return { status: 404, body: 'This view is not recorded in the demo.', headers: {} }
    },
    async send() {
      return { status: 403, body: 'The demo is read-only', headers: {} }
    },
  }
}

/** The name transport.ts loads (frozen contract). */
export function createFixturesTransport(): Transport {
  return createFixtureTransport()
}
