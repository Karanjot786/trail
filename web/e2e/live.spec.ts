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
  // Live covers the last five minutes only. The seeded data is older, so on a long CI run nothing is live by the time
  // this test runs; it sends its own two visits (one person each, two pages) so the page tracks have equal values.
  const run = `${test.info().project.name}-${test.info().retry}-${Date.now()}`
  for (const n of [1, 2]) {
    await page.request.post('/_t/e', {
      headers: { Origin: 'https://demo.trail.dev', 'Content-Type': 'text/plain' },
      data: JSON.stringify({ s: 'demo', t: 'pageview', a: `e2e-bars-${run}-${n}`, ss: `e2e-bars-s-${run}-${n}`, u: `https://demo.trail.dev/e2e-bars-${n}`, env: 'production' }),
    })
  }
  await goto('/live')
  const side = page.getByRole('region', { name: /pages|sources|countries/i }).first()
  const bars = side.locator('[data-bar]')
  // Live re-renders on its refresh timer, so a click can land mid-render under load. Retry the grouping click and the
  // measurement together until the page tracks are on screen and share one x and width.
  await expect(async () => {
    // Group by page: test visits from 127.0.0.1 have no country, so the default Country list can be empty.
    await side.getByText('Page', { exact: true }).click({ timeout: 2_000 })
    await expect(bars.first()).toBeVisible({ timeout: 2_000 })
    const xs = await bars.evaluateAll((els) => els.map((e) => { const r = (e.parentElement ?? e).getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width)] }))
    expect(xs.length).toBeGreaterThan(0)
    expect(new Set(xs.map((x) => x[0])).size).toBe(1)
    expect(new Set(xs.map((x) => x[1])).size).toBe(1)
  }).toPass({ timeout: 20_000 })
  expect(num('1')).toBe(1)
})
