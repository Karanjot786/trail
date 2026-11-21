// Data access transports (plan §0.13). Frozen after P0.
// `http` talks to the Go server; `fixtures` (F1, ./fixtures.ts) serves recorded JSON with no server.
// VITE_DATA=fixtures (or the old VITE_MOCK=1) picks fixtures; anything else is http.

export interface TransportResponse {
  status: number
  body: unknown
  headers: Record<string, string> // lower-case keys; carries x-total-count
}
export interface Transport {
  get(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<TransportResponse>
  send(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<TransportResponse>
  mode: 'http' | 'fixtures'
}

/** `/demo*` reads the public demo API, `/share/{token}*` the read-only share API, anything else `/api`. */
export function apiBase(pathname: string): string {
  if (/^\/demo(\/|$)/.test(pathname)) return '/api/demo'
  const share = /^\/share\/([^/]+)(\/|$)/.exec(pathname)
  if (share) return `/api/share/${share[1]}`
  return '/api'
}

/** The canonical fixture key: path + '?' + params sorted by key then value, without tz.
 *  The Go recorder (`trail demo record`) must produce byte-identical keys. */
export function fixtureKey(path: string, params: URLSearchParams): string {
  const entries = [...params].filter(([k]) => k !== 'tz')
  entries.sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
  return `${path}?${new URLSearchParams(entries).toString()}`
}

async function toResponse(res: Response): Promise<TransportResponse> {
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v
  })
  const text = await res.text()
  let body: unknown = text
  if (text && (headers['content-type'] ?? '').includes('json')) {
    try {
      body = JSON.parse(text)
    } catch {
      /* keep the raw text */
    }
  }
  return { status: res.status, body, headers }
}

export const httpTransport: Transport = {
  mode: 'http',
  async get(path, params, signal) {
    const qs = params.toString()
    const res = await fetch(`${apiBase(location.pathname)}${path}${qs ? `?${qs}` : ''}`, { signal, credentials: 'same-origin' })
    return toResponse(res)
  },
  async send(method, path, body) {
    const res = await fetch(`${apiBase(location.pathname)}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return toResponse(res)
  },
}

export function dataMode(): Transport['mode'] {
  const env = import.meta.env
  return env.VITE_DATA === 'fixtures' || env.VITE_MOCK === '1' ? 'fixtures' : 'http'
}

let fixtures: Transport | null = null
function fixturesTransport(): Transport {
  // Loaded lazily so the http build never carries the fixtures code in its entry chunk.
  const mod = import('./fixtures').then((m) => m.createFixturesTransport())
  return {
    mode: 'fixtures',
    get: async (path, params, signal) => (await mod).get(path, params, signal),
    send: async (method, path, body) => (await mod).send(method, path, body),
  }
}

export function getTransport(): Transport {
  if (dataMode() === 'http') return httpTransport
  return (fixtures ??= fixturesTransport())
}
