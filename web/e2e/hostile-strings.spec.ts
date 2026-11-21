/* T-3 (Review Focus 2): hostile strings in paths and event names render as text, truncate in the middle, never run,
 * and CSV exports neutralise formula prefixes. */
import { expect, test, titled, gate, type App } from './fixtures'
const check = (title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(null, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

const ORIGIN = 'https://demo.trail.dev'
const longPath = '/' + 'a'.repeat(2500) + '/middle-marker/' + 'b'.repeat(2500)
const names = ['<img src=x onerror=window.__x=1>', 'שלום עולם مرحبا', '🔥 launch 🚀', '=1+1']

async function post(page: import('@playwright/test').Page, body: object) {
  // A desktop browser's user agent: headless Chrome's own UA is (rightly) counted as a bot and left out.
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  const r = await page.request.post('/_t/e', { headers: { Origin: ORIGIN, 'Content-Type': 'text/plain', 'User-Agent': UA }, data: JSON.stringify(body) })
  expect(r.status(), 'ingest').toBeLessThan(300)
}

/** Ingest writes in batches (up to a second later): wait until the API lists every name. */
async function landed(page: import('@playwright/test').Page, want: string[]) {
  await expect
    .poll(async () => {
      const rows = await (await page.request.get('/api/events?site=demo&range=30d&tz=Asia/Kolkata')).json()
      return want.every((n) => rows.some((r: { name: string }) => r.name === n))
    }, { timeout: 10_000 })
    .toBe(true)
}

check('hostile paths and event names render as text, truncated in the middle, and nothing executes', async ({ page, goto }) => {
  await post(page, { s: 'demo', t: 'pageview', a: 'hostile-1', ss: 'hostile-s1', u: ORIGIN + longPath, env: 'production' })
  for (const n of names) await post(page, { s: 'demo', t: 'event', n, a: 'hostile-1', ss: 'hostile-s1', u: ORIGIN + '/', env: 'production' })
  await landed(page, names)
  await goto('/activity/events')
  expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined()
  await expect(page.getByText('<img src=x onerror=window.__x=1>').first()).toBeVisible()
  await expect(page.getByText('🔥 launch 🚀').first()).toBeVisible()
  await expect(page.getByText('שלום עולם مرحبا').first()).toBeVisible()
  // One visitor's page is not in the top rows: filter to it, so the Pages panel lists it.
  await goto(`/?p.pages=pages&f=path:${encodeURIComponent(longPath)}`)
  const cell = page.getByRole('region', { name: 'Pages' }).getByText(/a{3,}.*…|….*b{3,}/).first()
  await expect(cell).toBeVisible()
  expect(await cell.evaluate((e) => e.getBoundingClientRect().width)).toBeLessThan(900)
  expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

check('CSV export neutralises a leading "=" with a quote prefix', async ({ page }) => {
  await post(page, { s: 'demo', t: 'event', n: '=1+1', a: 'hostile-2', ss: 'hostile-s2', u: ORIGIN + '/', env: 'production' })
  await landed(page, ['=1+1'])
  const res = await page.request.get('/api/events?site=demo&range=30d&format=csv&tz=Asia/Kolkata')
  expect(res.ok()).toBeTruthy()
  expect(res.headers()['content-disposition']).toMatch(/attachment; filename="?trail-demo-events-/)
  const csv = await res.text()
  expect(csv).toContain("'=1+1")
  expect(csv.split('\n').some((l) => /^=/.test(l) || /,=1\+1/.test(l))).toBe(false)
})
