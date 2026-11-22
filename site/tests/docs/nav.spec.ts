import { test, expect } from '@playwright/test'

const mark = (page) => page.evaluate(() => { (window as any).__marker = crypto.randomUUID(); return (window as any).__marker })
const getMark = (page) => page.evaluate(() => (window as any).__marker)

test('no full reload between docs pages', async ({ page }) => {
  await page.goto('/docs/quickstart')
  const marker = await mark(page)
  const docs: string[] = []
  page.on('request', (r) => { if (r.resourceType() === 'document') docs.push(r.url()) })
  // [sidebar link, page h1]: the sidebar may name a page more fully than its title.
  for (const [link, h1] of [['Docker and Compose', 'Docker'], ['Privacy modes and consent'], ['Read API'], ['Changelog']]) {
    await page.locator('.VPSidebar').getByRole('link', { name: link, exact: true }).click()
    await expect(page.locator('h1')).toHaveText(h1 ?? link)
  }
  expect(await getMark(page)).toBe(marker)
  expect(docs).toEqual([])
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1)
})

test('leaves the SPA for non-docs links', async ({ page }) => {
  await page.goto('/docs/quickstart')
  await mark(page)
  await page.locator('header .brand').click()
  await page.waitForURL((u) => u.pathname === '/')
  expect(await getMark(page)).toBeUndefined()

  await page.goto('/docs/quickstart')
  const gh = page.locator('footer a[href*="github.com"]').first()
  await expect(gh).toHaveAttribute('href', /github\.com/)
  await expect(gh).toHaveAttribute('target', /.+/)

  await page.goto('/docs/quickstart')
  const demo = page.locator('header nav a', { hasText: 'Demo' })
  await mark(page)
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.resourceType() === 'document' && r.url().includes('/demo')),
    demo.click(),
  ])
  expect(req.url()).toContain('/demo')

  const res = await page.request.get('/changelog.xml')
  expect(res.status()).toBe(200)
})

test('back restores scroll, no animation on hash change', async ({ page }) => {
  await page.goto('/docs/operations/configuration')
  await page.evaluate(() => window.scrollTo(0, 1200))
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1100)
  await page.locator('.VPSidebar').getByRole('link', { name: 'Backups', exact: false }).first().click()
  await expect(page).toHaveURL(/backups/)
  await page.goBack()
  await expect(page).toHaveURL(/configuration/)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1100)

  // The route change above legitimately runs the 180ms page-enter fade; let it finish first.
  const running = () => page.evaluate(() => document.querySelector('.VPDoc .content-container')!.getAnimations().length)
  await expect.poll(running).toBe(0)

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('.VPDocAsideOutline a').first().click()
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  expect(await running()).toBe(0)
})

test('search opens and navigates without reload', async ({ page }) => {
  await page.goto('/docs/quickstart')
  const marker = await mark(page)
  await page.keyboard.press('/')
  await page.locator('.VPLocalSearchBox input').fill('consent')
  await expect(page.locator('.VPLocalSearchBox li[role=option]').first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/docs\/tracking\/privacy/)
  expect(await getMark(page)).toBe(marker)
})
