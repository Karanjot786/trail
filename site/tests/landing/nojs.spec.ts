import { test, expect } from '@playwright/test'

test.use({ javaScriptEnabled: false })

test('no-JS: every section readable in its final state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const ops = await page.locator('[data-reveal]').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))
  expect(ops.length).toBeGreaterThan(0)
  expect(ops.every((o) => o === '1')).toBe(true)
  await expect(page.locator('#goals')).toContainText('353')
  const tl = await page.locator('.tl').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity !== '0' && getComputedStyle(e).visibility !== 'hidden'))
  expect(tl.length).toBeGreaterThan(0)
  expect(tl.every(Boolean)).toBe(true)
  await expect(page.locator('.ans').first()).toBeVisible()
  await expect(page.locator('#pm .vrow')).toHaveCount(3)
  const dots = await page.locator('path.fw-dots').evaluateAll((ps) => ps.map((p) => getComputedStyle(p).opacity))
  expect(dots.length).toBeGreaterThan(0)
  expect(dots.every((o) => o === '1')).toBe(true)
  await expect(page.locator('.site-head')).toHaveAttribute('data-state', 'hero')
})
