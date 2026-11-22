import { test, expect } from '@playwright/test'

test('copy menu: keyboard opens, arrows move, Esc closes and returns focus', async ({ page }) => {
  await page.goto('/docs/quickstart')
  const toggle = page.getByRole('button', { name: 'More copy options' })
  const menu = page.getByRole('menu', { name: 'Copy page' })
  const item = (name: string) => page.getByRole('menuitem', { name })
  await expect(menu).toBeHidden()
  await toggle.focus()
  await page.keyboard.press('ArrowDown')
  await expect(menu).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(item('Copy as Markdown')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(item('View as Markdown')).toBeFocused()
  await page.keyboard.press('End')
  await expect(item('Open in Claude')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(item('Copy as Markdown')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  // ArrowUp opens on the last item; Enter opens on the first.
  await page.keyboard.press('ArrowUp')
  await expect(item('Open in Claude')).toBeFocused()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await expect(item('Copy as Markdown')).toBeFocused()
  // A click outside closes it without stealing focus back.
  await page.locator('h1').click()
  await expect(menu).toBeHidden()
})

test('copy menu links point at the markdown twin', async ({ page }) => {
  await page.goto('/docs/quickstart')
  await page.getByRole('button', { name: 'More copy options' }).click()
  await expect(page.getByRole('menuitem', { name: 'View as Markdown' })).toHaveAttribute('href', '/docs/quickstart.md')
  const md = encodeURIComponent('https://trail.karanjot.co.in/docs/quickstart.md')
  await expect(page.getByRole('menuitem', { name: 'Open in ChatGPT' })).toHaveAttribute('href', new RegExp('^https://chatgpt\\.com/\\?q=.*' + md.replace(/[.%]/g, '\\$&')))
  await expect(page.getByRole('menuitem', { name: 'Open in Claude' })).toHaveAttribute('href', new RegExp('^https://claude\\.ai/new\\?q=.*' + md.replace(/[.%]/g, '\\$&')))
  await expect(page.locator('.PageHeader nav[aria-label=Breadcrumb]')).toHaveText(/Getting started\s*\/?\s*Quickstart/)
})

test('feedback vote sends a Trail custom event', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__tracked = []
    w.trail = { track: (...a: unknown[]) => w.__tracked.push(a) }
  })
  await page.goto('/docs/quickstart')
  const row = page.locator('.DocFeedback')
  const box = await row.boundingBox()
  await row.getByRole('button', { name: 'Yes' }).click()
  await expect(row).toHaveText('Thanks for the feedback.')
  expect((await row.boundingBox())!.height).toBe(box!.height)
  expect(await page.evaluate(() => (window as any).__tracked)).toEqual([['Docs feedback', { page: '/docs/quickstart', helpful: 'yes' }]])
  // The next page starts unvoted.
  await page.locator('.VPSidebar').getByRole('link', { name: 'Docker and Compose', exact: true }).click()
  await expect(page.locator('h1')).toHaveText('Docker')
  await page.locator('.DocFeedback').getByRole('button', { name: 'No' }).click()
  expect((await page.evaluate(() => (window as any).__tracked))[1]).toEqual(['Docs feedback', { page: '/docs/install/docker', helpful: 'no' }])
})

test('no tracker script unless TRAIL_DOCS_SITE is set', async ({ page }) => {
  await page.goto('/docs/quickstart')
  await expect(page.locator('script[src="/_t/t.js"]')).toHaveCount(0)
})

test('search modal is at most 640px wide and shows excerpts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/docs/')
  await page.locator('.DocsHero .search-trigger').click()
  await page.locator('.VPLocalSearchBox input').fill('pageview')
  const first = page.locator('.VPLocalSearchBox li[role=option]').first()
  await expect(first).toBeVisible()
  const shell = await page.locator('.VPLocalSearchBox .shell').boundingBox()
  expect(shell!.width).toBeLessThanOrEqual(640)
  expect(shell!.y).toBeGreaterThan(900 * 0.12)
  await expect(first.locator('.excerpt')).toBeVisible()
  await expect(first.locator('.excerpt mark').first()).toBeAttached()
})

test('docs home: one h1, search trigger, run command, 8 sections', async ({ page }) => {
  await page.goto('/docs/')
  await expect(page.locator('h1')).toHaveText('Trail docs')
  const trigger = await page.locator('.DocsHero .search-trigger').boundingBox()
  expect(trigger!.height).toBe(44)
  await expect(page.locator('.DocsHero figcaption')).toContainText('Run Trail in one command')
  await expect(page.locator('.VPFeature')).toHaveCount(8)
})

test('no reload: home card, sidebar, copy menu and feedback stay in the SPA', async ({ page }) => {
  await page.goto('/docs/')
  await page.evaluate(() => ((window as any).__marker = 1))
  const docs: string[] = []
  page.on('request', (r) => { if (r.resourceType() === 'document') docs.push(r.url()) })
  await page.locator('.VPFeature', { hasText: 'Tracking' }).click()
  await expect(page.locator('h1')).toHaveText('Custom events')
  await page.getByRole('button', { name: 'More copy options' }).click()
  await page.keyboard.press('Escape')
  await page.locator('.DocFeedback').getByRole('button', { name: 'Yes' }).click()
  await page.locator('.VPSidebar').getByRole('link', { name: 'Read API', exact: true }).click()
  await expect(page.locator('h1')).toHaveText('Read API')
  expect(docs).toEqual([])
  expect(await page.evaluate(() => (window as any).__marker)).toBe(1)
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1)
})
