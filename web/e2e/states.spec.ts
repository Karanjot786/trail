/* Proto checks: 50 error card with retry + stale + range-aware skeleton, 52 error keeps stale numbers dimmed,
 * 70 offline freezes live indicators. Failures are provoked with page.route and context.setOffline. Owner: F1. */
import { expect, test, titled, gate, type App } from './fixtures'

// Playwright records a test's file from the call site, so the wrappers live in each spec rather than in fixtures.ts.
const chk = (nums: number | number[], title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(nums, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

chk(50, 'an API failure shows "Refresh failed" over the stale numbers; Retry recovers', async (app) => {
  const { page } = app
  await app.goto('/')
  await expect(page.getByRole('tablist', { name: 'Metrics' })).toBeVisible()
  let fail = true
  await page.route('**/api/stats*', (r) => (fail ? r.fulfill({ status: 500, body: 'boom' }) : r.continue()))
  await page.getByRole('button', { name: 'Date range' }).click()
  await page.getByRole('menuitemradio', { name: 'Last 7 days' }).click()
  await expect(page.getByText(/Refresh failed/)).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Metrics' })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: /Retry|Try again/ }).click()
  await expect(page.getByText(/Refresh failed/)).toHaveCount(0)
  app.errors.length = 0
})

chk(52, 'the loading skeleton names the range being loaded', async ({ page, goto }) => {
  await page.route('**/api/stats*', async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.continue() })
  await goto('/?range=7d').catch(() => {})
  await expect(page.getByText(/last 7 days/i).first()).toBeVisible()
})

chk(70, 'offline: a banner appears and Live indicators freeze; going back online resumes', async (app) => {
  const { page } = app
  await app.goto('/live')
  await page.context().setOffline(true)
  await expect(page.getByText(/You are offline/)).toBeVisible()
  await expect(page.getByTestId('freshness').or(page.getByText(/paused|frozen/i)).first()).toBeVisible()
  await page.context().setOffline(false)
  await expect(page.getByText(/You are offline/)).toHaveCount(0)
  app.errors.length = 0
})
