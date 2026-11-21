/* Geo accuracy (plan T-2b): honest labels, and the signed first-party proxy path built with the section 0.12 algorithm. */
import { createHash, createHmac } from 'node:crypto'
import { aiGate, expect, test } from './fixtures'

/** The X-Trail-Proxy header for one forward (section 0.12). The key is the raw sha256 of the crawl token. */
function proxyHeader(token: string, p: { site: string; t: number; ip: string; geo: string; geoSrc: string; host: string; body: string }, tamper = false) {
  const key = createHash('sha256').update(token).digest()
  const msg = ['v1', p.site, String(p.t), p.ip, p.geo, p.geoSrc, p.host, createHash('sha256').update(p.body).digest('hex')].join('\n')
  let mac = createHmac('sha256', key).update(msg).digest('hex')
  if (tamper) mac = mac.slice(0, -1) + (mac.endsWith('0') ? '1' : '0')
  return `v1;k=${token.slice(0, 12)};t=${p.t};s=${mac}`
}

test('the Location panel labels its accuracy', async ({ app }) => {
  aiGate()
  const { page } = app
  await app.goto('/?site=demo')
  await expect(page.getByRole('tab', { name: 'Regions · approximate' })).toBeVisible()
  const cities = page.getByRole('tab', { name: 'Cities · rough estimate' })
  await expect(cities).toBeVisible()
  await cities.click()
  await expect(page.getByText(/often the ISP.s hub city/i).first()).toBeAttached()
})

test('settings recommend GeoLite2 City', async ({ app }) => {
  aiGate()
  await app.goto('/settings/config')
  await expect(app.page.getByRole('main')).toContainText('GeoLite2 City')
})

test.describe('signed proxy geo', () => {
  let tokenId = ''
  let token = ''
  test.beforeEach(async ({ request }) => {
    aiGate()
    const res = await request.post('/api/tokens', { data: { name: `e2e-proxy-${Date.now()}`, scope: 'crawl', site: 'docs' } })
    expect(res.status()).toBe(201)
    const j = await res.json()
    tokenId = j.id
    token = j.token
  })
  test.afterEach(async ({ request }) => {
    if (tokenId) await request.delete(`/api/tokens/${tokenId}`)
    tokenId = ''
  })

  const forward = (request: import('@playwright/test').APIRequestContext, id: string, tamper: boolean) => {
    const body = JSON.stringify({ s: 'docs', t: 'pageview', a: id, ss: `${id}-s`, u: 'https://docs.trail.dev/e2e-geo', env: 'production' })
    const f = { site: 'docs', t: Math.floor(Date.now() / 1000), ip: '203.0.113.9', geo: 'IN|MH|Mumbai', geoSrc: 'vercel', host: 'docs.trail.dev', body }
    return request.post('/_t/e', {
      data: body,
      headers: {
        Origin: 'https://docs.trail.dev',
        'Content-Type': 'text/plain',
        'X-Trail-IP': f.ip,
        'X-Trail-Geo': f.geo,
        'X-Trail-Geo-Src': f.geoSrc,
        'X-Trail-Host': f.host,
        'X-Trail-Proxy': proxyHeader(token, f, tamper),
      },
    })
  }

  test('a valid signed forward stores Mumbai and the source; one flipped HMAC digit stores nothing', async ({ app, request }) => {
    aiGate()
    const { page } = app
    const bad = await forward(request, 'e2e-geo-bad', true)
    expect(bad.status()).toBe(204)
    const sessionsAfterBad = await (await request.get('/api/sessions?site=docs&range=today&tz=Asia/Kolkata')).text()
    expect(sessionsAfterBad).not.toContain('Mumbai')
    expect((await (await request.get('/api/sites/docs/status')).json()).geo?.source ?? 'db').not.toBe('vercel')

    const ok = await forward(request, 'e2e-geo-ok', false)
    expect(ok.status()).toBe(204)
    await expect
      .poll(async () => (await (await request.get('/api/live?site=docs&tz=Asia/Kolkata')).text()).includes('Mumbai'), { timeout: 15_000 })
      .toBe(true)
    await app.goto('/live?site=docs')
    await expect(page.getByText('Mumbai').first()).toBeVisible({ timeout: 15_000 })
    await expect.poll(async () => (await (await request.get('/api/sites/docs/status')).json()).geo?.source, { timeout: 15_000 }).toBe('vercel')
  })
})
