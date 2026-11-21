import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, Gone, HttpError, Unauthorized } from './client'

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json', ...headers } }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}
const q = new URLSearchParams({ site: 'demo', range: '7d' })

describe('client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('builds the request from the base and query', async () => {
    const fetch = respond(200, { visitors: 1 })
    await api.stats(q)
    expect(fetch.mock.calls[0][0]).toBe('/api/stats?site=demo&range=7d')
  })
  it('adds route params without touching the caller query', async () => {
    const fetch = respond(200, { points: [] })
    await api.series(q, 'sessions', true)
    expect(fetch.mock.calls[0][0]).toBe('/api/series?site=demo&range=7d&metric=sessions&extras=1')
    expect(q.has('metric')).toBe(false)
  })
  it('maps 401 to Unauthorized', async () => {
    respond(401, 'no')
    await expect(api.stats(q)).rejects.toBeInstanceOf(Unauthorized)
  })
  it('maps 410 to Gone', async () => {
    respond(410, 'expired')
    await expect(api.stats(q)).rejects.toBeInstanceOf(Gone)
  })
  it('maps other errors to HttpError with the server text', async () => {
    respond(400, { error: 'pick a site' })
    await expect(api.funnels('all')).rejects.toMatchObject({ status: 400, message: 'pick a site' })
    await expect(api.funnels('all')).rejects.toBeInstanceOf(HttpError)
  })
  it('reads X-Total-Count for lists', async () => {
    respond(200, [{ person: 'a' }], { 'X-Total-Count': '42' })
    expect(await api.visitors(q, { limit: 1 })).toEqual({ rows: [{ person: 'a' }], total: 42 })
  })
  it('falls back to the row count and never returns a null list', async () => {
    respond(200, null)
    expect(await api.sessions(q, {})).toEqual({ rows: [], total: 0 })
  })
  it('builds export urls', () => {
    expect(api.exportUrl('/breakdown', q, 'csv')).toBe('/api/breakdown?site=demo&range=7d&format=csv')
  })
})
