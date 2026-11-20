import { test, expect } from '@playwright/test'

test('journey rows come from the dataset', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#journey')).toHaveCount(1)
  await expect(page.locator('#demo')).toHaveCount(0)
  await expect(page.locator('#journey .day .d b')).toHaveText(['Nov 2', 'Nov 12', 'Nov 19'])
  const chips = page.locator('#journey .day').first().locator('.chip')
  await expect(chips).toHaveText([/google\.com$/, /^\/docs\/components\/data-story 1m6s\s*↓20%$/, /^\/docs\/components 1m40s\s*↓49%$/])
  await expect(page.locator('#journey .sl')).toHaveCount(4)
  await expect(page.locator('#journey .jnote')).toHaveText("Recreated in HTML from the dashboard's Visitors tab.")
})

test('route art is inline SVG, not canvas', async ({ page }) => {
  await page.goto('/')
  expect(await page.locator('#journey svg circle.rt').count()).toBeGreaterThan(10)
  await expect(page.locator('#journey canvas')).toHaveCount(0)
})

test('route walks in on view, and is there with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('#journey .route-a circle.rt').first()).toHaveCSS('opacity', '0.4')
})
