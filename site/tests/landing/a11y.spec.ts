import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

for (const w of [1280, 390]) {
  test.describe(`axe at ${w}`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: w, height: 844 }) })

    test('default', async ({ page }) => { await page.goto('/'); await axe(page) })

    test('header solid after scroll', async ({ page }) => {
      await page.goto('/')
      await page.evaluate(() => window.scrollTo(0, 1500))
      await expect(page.locator('.site-head')).toHaveAttribute('data-state', 'solid')
      await axe(page)
    })

    test('privacy full', async ({ page }) => {
      await page.goto('/')
      await page.locator('#pm-full').click()
      await expect(page.locator('#pm')).toHaveAttribute('data-mode', 'full')
      await axe(page)
    })

    test('privacy consent accepted', async ({ page }) => {
      await page.goto('/')
      await page.locator('#pm-accept').click()
      await expect(page.locator('#pm')).toHaveAttribute('data-store', 'on')
      await axe(page)
    })

    test('mcp json open', async ({ page }) => {
      await page.goto('/')
      await page.locator('.jtog').click()
      await expect(page.locator('#cjson')).toBeVisible()
      await axe(page)
    })

    test('reduced motion final state', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      await axe(page)
    })
  })
}
