import { test, expect } from '@playwright/test'
// @ts-ignore
import { pages } from '../../scripts/pages.mjs'

test.use({ viewport: { width: 390, height: 844 } })

test('no horizontal scroll at 390px', async ({ page }) => {
  test.setTimeout(120_000)
  for (const p of pages as string[]) {
    await page.goto(p)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(over, p).toBeLessThanOrEqual(0)
  }
})
