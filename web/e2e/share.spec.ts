/* Proto check 58 (read-only share view) plus expired and revoked links (plan Review Focus 4, T-2).
 * Owner: F1 + F5 + B2. */
import { expect, test, titled, gate, type App } from './fixtures'

// Playwright records a test's file from the call site, so the wrappers live in each spec rather than in fixtures.ts.
const chk = (nums: number | number[], title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(nums, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })
const check = (title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(null, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

async function newShare(page: import('@playwright/test').Page, body: Record<string, unknown> = {}) {
  const res = await page.request.post('/api/shares', { data: { site: 'demo', label: 'e2e', state: 'range=30d', hideRevenue: false, ttl: '7d', ...body } })
  expect(res.status()).toBeLessThan(300)
  const s = await res.json()
  expect(s.url, 'share url on create').toBeTruthy()
  return { id: s.id as string, path: new URL(s.url, 'http://x').pathname.replace(/\/?$/, '/') }
}

chk(58, 'read-only share view hides Share, Settings, the site switcher and chip removal; visitor labels are pseudonyms', async ({ page, goto }) => {
  const s = await newShare(page, { state: 'range=30d&f=device:mobile' })
  await goto(s.path + '?f=device:mobile')
  await expect(page.getByRole('status').filter({ hasText: 'Read-only link' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: /site/i })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Filters' }).getByRole('button', { name: /^Remove|Clear all/ })).toHaveCount(0)
  for (const l of await page.getByTestId('journey-label').allInnerTexts()) expect(l).toMatch(/^Visitor [A-Z2-7]{4}$/)
  await page.keyboard.press('Shift+X')
  expect(await page.evaluate(() => location.search)).toContain('device')
  await page.request.delete(`/api/shares/${s.id}`)
})

check('hr=1 hides Revenue in the share view', async ({ page, goto }) => {
  const s = await newShare(page, { hideRevenue: true })
  await goto(s.path + '?hr=1')
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Revenue' })).toHaveCount(0)
  await expect(page.getByRole('tablist', { name: 'Metrics' })).not.toContainText('Net revenue')
  await page.request.delete(`/api/shares/${s.id}`)
})

check('a revoked share answers 410 and the open page says so, with no login form', async ({ page, goto }) => {
  const s = await newShare(page)
  await goto(s.path)
  await expect(page.getByRole('tablist', { name: 'Metrics' })).toBeVisible()
  expect((await page.request.delete(`/api/shares/${s.id}`)).status()).toBeLessThan(300)
  const api = await page.request.get(`/api/share/${s.path.split('/')[2]}/meta`)
  expect(api.status()).toBe(410)
  await page.reload()
  await expect(page.getByText('This link has expired or was revoked')).toBeVisible()
  await expect(page.getByLabel(/password/i)).toHaveCount(0)
})
