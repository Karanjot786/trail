/* Proto checks ported here (numbers from proto-d/test/interactions.cjs). Owner: F1.
 *  1 theme tokens   2 sidebar items   19 saved views   21 ? sheet   26 every screen, no console errors
 * 27 light theme   37 ranges          49 Esc closes one layer   51 sidebar collapse   57 S saves filters only
 * 69 one overlay stack   74 date picker never cut off */
import { expect, test, titled, gate, type App } from './fixtures'

// Playwright records a test's file from the call site, so the wrappers live in each spec rather than in fixtures.ts.
const chk = (nums: number | number[], title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(nums, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

const loc = (p: import('@playwright/test').Page) => p.evaluate(() => decodeURIComponent(location.pathname + location.search))

chk(1, 'dark is the default: canvas #0b0b0c and panels #121214', async ({ page, goto }) => {
  await goto('/')
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 11, 12)')
  const panel = page.getByRole('region', { name: 'Sources' })
  expect(await panel.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(18, 18, 20)')
})

chk(2, 'sidebar: the IA in order, Views region, Settings at the bottom', async ({ page, goto }) => {
  await goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  const labels = await nav.getByRole('link').allInnerTexts()
  // The first line is the item's name; Live also carries its online count.
  expect(labels.map((l) => l.trim().split('\n')[0].trim()).slice(0, 7)).toEqual(['Overview', 'Live', 'Acquisition', 'Activity', 'Conversions', 'Revenue', 'AI crawlers'])
  await expect(page.getByRole('region', { name: 'Views' })).toBeVisible()
  // Settings sits at the bottom of the sidebar, below the Views region.
  const side = page.getByRole('complementary', { name: 'Sidebar' })
  await expect(side.getByRole('link', { name: 'Settings' })).toBeVisible()
  const y = async (l: import('@playwright/test').Locator) => (await l.boundingBox())!.y
  expect(await y(side.getByRole('link', { name: 'Settings' }))).toBeGreaterThan(await y(page.getByRole('region', { name: 'Views' })))
})

chk(19, 'saved views: S names the filter set, it appears under Views and survives a reload', async ({ page, goto }) => {
  await goto('/?f=source:Google')
  await page.keyboard.press('s')
  await page.getByRole('textbox', { name: /name/i }).fill('Google people')
  await page.keyboard.press('Enter')
  const views = page.getByRole('region', { name: 'Views' })
  await expect(views.getByRole('link', { name: 'Google people' })).toBeVisible()
  await goto('/live')
  await page.reload()
  await views.getByRole('link', { name: 'Google people' }).click()
  expect(await loc(page)).toContain('f=source:Google')
  await views.getByRole('link', { name: 'Google people' }).hover()
  await views.getByRole('button', { name: /remove|delete/i }).click()
  await expect(views.getByRole('link', { name: 'Google people' })).toHaveCount(0)
})

chk(21, '? opens the keyboard shortcuts sheet and Esc closes it', async ({ page, goto }) => {
  await goto('/')
  await page.keyboard.press('Shift+?')
  const d = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(d).toContainText('Save the view')
  await expect(d).toContainText('Activity')
  await page.keyboard.press('Escape')
  await expect(d).toHaveCount(0)
})

chk(26, 'every screen renders without console errors', async (app) => {
  const routes = ['/live', '/acquisition', '/acquisition/ai', '/acquisition/campaigns', '/acquisition/landing', '/activity', '/activity/sessions', '/activity/events', '/activity/paths', '/conversions', '/conversions/funnels', '/revenue', '/crawlers', '/settings', '/settings/install', '/settings/assistants', '/settings/tokens', '/settings/sharing', '/settings/data', '/settings/config', '/?site=all', '/?site=docs']
  for (const r of routes) {
    await app.goto(r)
    await expect(app.page.getByRole('main'), r).toBeVisible()
  }
})

chk(27, 'light theme is the paper theme (#f6f9fe), kept in localStorage not the URL', async ({ page, goto }) => {
  await goto('/')
  await page.keyboard.press('t')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 249, 254)')
  expect(await page.evaluate(() => localStorage.getItem('trail.theme'))).toBe('light')
  expect(await loc(page)).not.toContain('theme')
  await page.keyboard.press('t')
})

chk(37, 'ranges: calendar presets, 12 months, custom range kept apart from Compare, bad range noted', async ({ page, goto }) => {
  await goto('/')
  await page.getByRole('button', { name: 'Date range' }).click()
  const menu = page.getByRole('menu')
  for (const x of ['Today', 'Yesterday', 'This week', 'This month', 'Last month', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 12 months', 'Custom range']) {
    await expect(menu).toContainText(x)
  }
  await expect(menu).not.toContainText('Compare with')
  await page.keyboard.press('Escape')
  await goto('/?range=c:2026-10-01~2026-10-31')
  await expect(page.getByTestId('chart-readout')).toContainText('Oct 1 – Oct 31')
  await goto('/?range=bogus')
  await expect(page.getByText(/not a range Trail knows/)).toBeVisible()
  await goto('/?range=mtd')
  await expect(page.getByTestId('freshness')).toContainText('same days last month')
})

chk(49, 'Esc closes the top layer only and never clears filters', async ({ page, goto }) => {
  await goto('/?f=source:Google&f=device:mobile')
  await page.keyboard.press('Escape')
  expect((await loc(page)).split('f=').length).toBe(3)
  await page.getByRole('button', { name: 'Date range' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  expect((await loc(page)).split('f=').length).toBe(3)
})

chk(51, 'sidebar collapse: [ toggles with no animation or blur', async ({ page, goto }) => {
  await goto('/')
  await page.keyboard.press('[')
  const nav = page.getByRole('navigation', { name: 'Main' })
  expect(await nav.evaluate((e) => getComputedStyle(e).transitionDuration.split(',').every((d) => parseFloat(d) === 0))).toBe(true)
  expect(await nav.evaluate((e) => getComputedStyle(e).filter)).toBe('none')
  await page.keyboard.press('[')
})

chk(57, 'S saves the current filters, never the open sheet', async ({ page, goto }) => {
  await goto('/?f=device:mobile&dr=source|Google')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('s')
  const save = page.getByRole('dialog', { name: /save/i })
  await expect(save).toContainText(/Device is mobile/i)
  // Views are server state shared by parallel tests: name this one and find it by name.
  await save.getByRole('textbox', { name: /name/i }).fill('Mobile only (57)')
  await page.keyboard.press('Enter')
  const link = page.getByRole('region', { name: 'Views' }).getByRole('link', { name: 'Mobile only (57)' })
  await expect(link).toBeVisible()
  const href = await link.getAttribute('href')
  expect(decodeURIComponent(href ?? '')).toContain('device:mobile')
  expect(href).not.toContain('dr=')
  const mine = ((await (await page.request.get('/api/views')).json()) as { id: number; name: string }[]).find((v) => v.name === 'Mobile only (57)')
  if (mine) await page.request.delete(`/api/views/${mine.id}`)
  await goto('/?dr=source|Google')
  await page.keyboard.press('s')
  await expect(page.getByRole('dialog', { name: /save/i })).toContainText(/No filters are on/)
})

chk(69, 'one overlay stack: Esc closes exactly one layer', async ({ page, goto }) => {
  await goto('/?dr=source|Google')
  await page.keyboard.press('Shift+?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

chk(74, 'date picker: "Show this range" is never cut off at 900 px width', async ({ page, goto }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await goto('/')
  await page.getByRole('button', { name: 'Date range' }).click()
  await page.getByRole('menuitem', { name: 'Custom range' }).click()
  const b = page.getByRole('button', { name: 'Show this range' })
  await expect(b).toBeInViewport({ ratio: 1 })
})
