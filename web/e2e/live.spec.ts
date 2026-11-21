/* Proto checks: 55 install test visit appears in Live at once (with F5), 64 (live part) equal values get equal bars.
 * Owner: F3. */
import { expect, num, test, titled, gate, type App } from './fixtures'

// Playwright records a test's file from the call site, so the wrappers live in each spec rather than in fixtures.ts.
const chk = (nums: number | number[], title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(nums, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

chk(55, 'a test visit appears in Live immediately; "Watch it live" shows it', async ({ page, goto, api }) => {
  await goto('/live')
  const before = await api('live')
  await page.request.post('/_t/e', {
    headers: { Origin: 'https://demo.trail.dev', 'Content-Type': 'text/plain' },
    data: JSON.stringify({ s: 'demo', t: 'pageview', a: 'e2e-live-1', ss: 'e2e-live-s1', u: 'https://demo.trail.dev/e2e-test-visit', env: 'production' }),
  })
  await expect.poll(async () => (await api('live')).active, { timeout: 15_000 }).toBeGreaterThanOrEqual(before.active)
  await expect(page.getByText('/e2e-test-visit').first()).toBeVisible({ timeout: 15_000 })
})

chk(64, 'equal values get equal bars: Live tracks share one x and width', async ({ page, goto }) => {
  await goto('/live')
  const bars = page.getByRole('region', { name: /pages|sources|countries/i }).first().locator('[data-bar]')
  const xs = await bars.evaluateAll((els) => els.map((e) => { const r = (e.parentElement ?? e).getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width)] }))
  expect(new Set(xs.map((x) => x[0])).size).toBe(1)
  expect(new Set(xs.map((x) => x[1])).size).toBe(1)
  expect(num('1')).toBe(1)
})
