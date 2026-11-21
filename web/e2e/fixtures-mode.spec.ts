/* T-6: fixture-mode smoke against `vite preview` with no Go server. Run with playwright.fixtures.config.ts.
 * Covers: every screen renders without console errors, an unrecorded filter shows the preset banner, Live moves
 * between polls, and a write says the demo is read-only. Each test is fixme until F1 task 8 (the fixtures transport)
 * and B2 task 10 (the recorder) have merged. */
import { expect, test } from '@playwright/test'

const SCREENS = ['/', '/live', '/acquisition', '/acquisition/ai', '/acquisition/campaigns', '/acquisition/landing', '/activity/visitors', '/activity/sessions', '/activity/events', '/activity/paths', '/conversions/goals', '/conversions/funnels', '/revenue', '/crawlers', '/settings/sites', '/settings/sharing']

test.beforeEach(() => {
  test.fixme(!process.env.E2E_ALL, 'waits for the fixtures transport and the recorder (F1-8, B2-10)')
})

test('every screen renders without console errors and without a server', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const api: string[] = []
  page.on('request', (r) => /\/api\//.test(r.url()) && api.push(r.url()))
  for (const s of SCREENS) {
    await page.goto(s)
    await expect(page.getByRole('main'), s).toBeVisible()
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
  }
  expect(api, 'no request may reach /api/ in fixtures mode').toEqual([])
  expect(errors).toEqual([])
})

test('AI visibility tabs and actor=all load from fixtures with no preset banner (AI agents)', async ({ page }) => {
  test.fixme(!process.env.E2E_AI && !process.env.E2E_ALL, 'waits for the AI-agents builders to merge (set E2E_AI=1)')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const s of ['/demo/ai/funnel', '/demo/ai/agents', '/demo/?actor=all']) {
    await page.goto(s)
    await expect(page.getByRole('main'), s).toBeVisible()
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByRole('status').filter({ hasText: 'The demo shows preset views' }), s).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('the freshness line reads "Sample data as of"', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('freshness')).toContainText(/Sample data as of/)
})

test('an unrecorded filter combination shows the preset banner', async ({ page }) => {
  await page.goto('/?f=country:ZZ&f=device:tablet&f=os:Plan9')
  await expect(page.getByRole('status').filter({ hasText: 'The demo shows preset views' })).toBeVisible()
})

test('Live numbers change between two polls', async ({ page }) => {
  await page.goto('/live')
  const read = () => page.getByTestId('live-active').innerText()
  const stream = () => page.getByRole('main').innerText()
  const a = await stream()
  await expect.poll(async () => (await stream()) !== a, { timeout: 20_000 }).toBe(true)
  expect(await read()).toMatch(/\d/)
})

test('a write says "The demo is read-only"', async ({ page }) => {
  // Settings explains up front that the demo makes no links or tokens; a write from the shell is answered.
  await page.goto('/settings/sharing')
  await expect(page.getByRole('main')).toContainText('The demo is read-only')
  await page.goto('/?f=device:mobile')
  await page.getByRole('button', { name: 'Save the current view' }).click()
  await page.getByRole('button', { name: 'Pin to sidebar' }).click()
  await expect(page.getByText('The demo is read-only').first()).toBeVisible()
})
