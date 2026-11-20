import { test, expect } from '@playwright/test'

const brand = (page) =>
  page.locator('header .brand').evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    fontSize: getComputedStyle(el).fontSize,
  }))

test('header matches landing', async ({ page }) => {
  await page.goto('/')
  const landing = await brand(page)
  await page.goto('/docs/quickstart')
  expect(await brand(page)).toEqual(landing)
  await expect(page.locator('header nav[aria-label="Main"] a')).toHaveText(['Docs', 'Demo', 'GitHub'])
})

test('no appearance toggle', async ({ page }) => {
  await page.goto('/docs/quickstart')
  await expect(page.locator('.VPSwitchAppearance')).toHaveCount(0)
})

test('leaves SPA for non-docs links', async ({ page }) => {
  await page.goto('/docs/quickstart')
  await page.evaluate(() => ((window as any).__spa = 1))
  await page.locator('header .brand').click()
  await page.waitForURL((u) => u.pathname === '/')
  expect(await page.evaluate(() => (window as any).__spa)).toBeUndefined()
})
