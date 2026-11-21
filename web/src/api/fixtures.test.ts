import { describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createFixtureTransport, fallbacks } from './fixtures'
import { fixtureKey } from './transport'

const q = (s: string) => new URLSearchParams(s)

function transport(files: Record<string, unknown>, keys: Record<string, string>) {
  const fetchImpl = vi.fn(async (url: string) => {
    const name = String(url).replace('/demo-data/', '')
    const body = name === 'index.json' ? { recordedAt: 1, now: 1, tz: 'Asia/Kolkata', keys } : files[name.replace(/\.json$/, '')]
    return new Response(body === undefined ? 'missing' : JSON.stringify(body), { status: body === undefined ? 404 : 200 })
  }) as unknown as typeof fetch
  return { t: createFixtureTransport('/demo-data', fetchImpl), fetchImpl }
}

describe('fixtures transport', () => {
  it('an exact key hits its file', async () => {
    const key = fixtureKey('/stats', q('site=demo&range=30d&cmp=prev&env=production'))
    const { t } = transport({ s1: { visitors: 525 } }, { [key]: 's1' })
    const res = await t.get('/stats', q('site=demo&range=30d&cmp=prev&env=production&tz=Asia/Kolkata'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ visitors: 525 })
    expect(res.headers['x-trail-preset']).toBeUndefined()
  })

  it('f=source:Google&f=country:IN falls back to f=source:Google with x-trail-preset: 1', async () => {
    const key = fixtureKey('/stats', q('site=demo&range=30d&cmp=prev&f=source:Google'))
    const { t } = transport({ g: { visitors: 163 } }, { [key]: 'g' })
    const res = await t.get('/stats', q('site=demo&range=30d&cmp=prev&f=source:Google&f=country:IN'))
    expect(res.body).toEqual({ visitors: 163 })
    expect(res.headers['x-trail-preset']).toBe('1')
  })

  it('an unknown range falls back to 30d', async () => {
    const key = fixtureKey('/stats', q('site=demo&range=30d&cmp=prev'))
    const { t } = transport({ d: { visitors: 1 } }, { [key]: 'd' })
    const res = await t.get('/stats', q('site=demo&range=wtd&cmp=prev'))
    expect(res.body).toEqual({ visitors: 1 })
    expect(res.headers['x-trail-preset']).toBe('1')
  })

  it('applies limit and offset to a recorded list and sets x-total-count', async () => {
    const key = fixtureKey('/breakdown', q('site=demo&range=30d&cmp=prev&dim=path'))
    const rows = Array.from({ length: 30 }, (_, i) => ({ key: `/${i}`, visitors: 30 - i }))
    const { t } = transport({ b: rows }, { [key]: 'b' })
    const res = await t.get('/breakdown', q('site=demo&range=30d&cmp=prev&dim=path&limit=20'))
    expect((res.body as unknown[]).length).toBe(20)
    expect(res.headers['x-total-count']).toBe('30')
    expect(res.headers['x-trail-preset']).toBeUndefined()
  })

  it('POST answers 403', async () => {
    const { t } = transport({}, {})
    expect((await t.send('POST', '/views', { name: 'x' })).status).toBe(403)
  })

  it('an unrecorded route answers 404', async () => {
    const { t } = transport({}, {})
    expect((await t.get('/stats', q('site=demo'))).status).toBe(404)
  })

  it('the fallback order is: extra filters, all filters, cmp, range, site', () => {
    const steps = fallbacks(q('site=docs&range=7d&cmp=none&f=source:Google&f=country:IN')).map((p) => p.toString())
    expect(steps).toEqual([
      'site=docs&range=7d&cmp=none&f=source%3AGoogle&f=country%3AIN',
      'site=docs&range=7d&cmp=none&f=source%3AGoogle',
      'site=docs&range=7d&cmp=none',
      'site=docs&range=7d&cmp=prev',
      'site=docs&range=30d&cmp=prev',
      'site=demo&range=30d&cmp=prev',
    ])
  })

  it('the keys in keys.json round-trip through fixtureKey', () => {
    // The recorder writes its keys into index.json (the "keys.json" of §0.13). Use it when present,
    // and always check a sample shaped like the plan.
    const sample = [
      fixtureKey('/stats', q('site=demo&range=30d&cmp=prev&env=production')),
      fixtureKey('/breakdown', q('site=demo&range=30d&cmp=prev&dim=path&f=source:Google')),
      fixtureKey('/sites', q('')),
      fixtureKey('/journey', q('site=demo&range=30d&cmp=prev&person=p~1')),
    ]
    const idx = new URL('../../public/demo-data/index.json', import.meta.url).pathname
    const keys = existsSync(idx) ? Object.keys((JSON.parse(readFileSync(idx, 'utf8')) as { keys: Record<string, string> }).keys) : []
    for (const k of [...sample, ...keys]) {
      const i = k.indexOf('?')
      expect(fixtureKey(k.slice(0, i), new URLSearchParams(k.slice(i + 1)))).toBe(k)
    }
  })
})
