/* Geo accuracy (plan T-2b): honest labels, and the signed first-party proxy path built with the section 0.12 algorithm. */
import { createHash, createHmac } from 'node:crypto'
import { expect, test } from './fixtures'

/** The X-Trail-Proxy header for one forward (section 0.12). The key is the raw sha256 of the crawl token. */
function proxyHeader(token: string, p: { site: string; t: number; ip: string; geo: string; geoSrc: string; host: string; body: string }, tamper = false) {
  const key = createHash('sha256').update(token).digest()
  const msg = ['v1', p.site, String(p.t), p.ip, p.geo, p.geoSrc, p.host, createHash('sha256').update(p.body).digest('hex')].join('\n')
  let mac = createHmac('sha256', key).update(msg).digest('hex')
  if (tamper) mac = mac.slice(0, -1) + (mac.endsWith('0') ? '1' : '0')
  return `v1;k=${token.slice(0, 12)};t=${p.t};s=${mac}`
}

test('the Location panel labels its accuracy', async ({ app }) => {
  const { page } = app
  await app.goto('/?site=demo')
  await expect(page.getByRole('tab', { name: 'Regions · approximate' })).toBeVisible()
  const cities = page.getByRole('tab', { name: 'Cities · rough estimate' })
  await expect(cities).toBeVisible()
  await cities.click()
  await expect(page.getByText(/often the ISP.s hub city/i).first()).toBeAttached()
})

test('settings recommend GeoLite2 City', async ({ app }) => {
  await app.goto('/settings/config')
  await expect(app.page.getByRole('main')).toContainText('GeoLite2 City')
})

test.describe('signed proxy geo', () => {
  // A fresh site per run, so the seed's own Mumbai visitors and a parallel project's forwards cannot answer for this one.
  let site = ''
  let host = ''
  let tokenId = ''
  let token = ''
  test.beforeEach(async ({ request }, info) => {
    site = `geo${info.project.name}${Date.now().toString(36)}`.replace(/[^a-z0-9]/g, '')
    host = `${site}.example.com`
    expect((await request.post('/api/sites', { data: { id: site, domain: host } })).status()).toBe(201)
    const res = await request.post('/api/tokens', { data: { name: `e2e-proxy-${site}`, scope: 'crawl', site } })
    expect(res.status()).toBe(201)
    const j = await res.json()
    tokenId = j.id
    token = j.token
  })
  test.afterEach(async ({ request }) => {
    if (tokenId) await request.delete(`/api/tokens/${tokenId}`)
    if (site) await request.delete(`/api/sites/${site}?purge=1`)
    tokenId = site = ''
  })

  const forward = (request: import('@playwright/test').APIRequestContext, id: string, tamper: boolean) => {
    const body = JSON.stringify({ s: site, t: 'pageview', a: id, ss: `${id}-s`, u: `https://${host}/e2e-geo`, env: 'production' })
    const f = { site, t: Math.floor(Date.now() / 1000), ip: '203.0.113.9', geo: 'IN|MH|Mumbai', geoSrc: 'vercel', host, body }
    return request.post('/_t/e', {
      data: body,
      headers: {
        Origin: `https://${host}`,
        'Content-Type': 'text/plain',
        'X-Trail-IP': f.ip,
        'X-Trail-Geo': f.geo,
        'X-Trail-Geo-Src': f.geoSrc,
        'X-Trail-Host': f.host,
        'X-Trail-Proxy': proxyHeader(token, f, tamper),
      },
    })
  }
  const status = async (request: import('@playwright/test').APIRequestContext) =>
    (await (await request.get(`/api/sites/${site}/status`)).json()).geo?.source ?? 'none'

  test('a valid signed forward stores Mumbai and the source; one flipped HMAC digit stores nothing', async ({ app, request }) => {
    const { page } = app
    const bad = await forward(request, 'e2e-geo-bad', true)
    expect(bad.status()).toBe(204)
    const afterBad = await (await request.get(`/api/sessions?site=${site}&range=today&tz=Asia/Kolkata`)).text()
    expect(afterBad).not.toContain('Mumbai')
    expect(await status(request)).not.toBe('vercel')

    // Two signed hits outnumber the unsigned one, so the site's main location source becomes the edge.
    for (const id of ['e2e-geo-ok1', 'e2e-geo-ok2']) expect((await forward(request, id, false)).status()).toBe(204)
    await expect
      .poll(async () => (await (await request.get(`/api/live?site=${site}&tz=Asia/Kolkata`)).text()).includes('Mumbai'), { timeout: 15_000 })
      .toBe(true)
    await app.goto(`/live?site=${site}`)
    await expect(page.getByText('Mumbai').first()).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => status(request), { timeout: 15_000 }).toBe('vercel')
  })
})
