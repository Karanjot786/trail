// A0 kernel check. Builder E deletes this in E1, when the page-wide suites replace it.
import { test, expect } from '@playwright/test'

test('kernel renders every section in order', async ({ page }) => {
  await page.goto('/')
  const ids = await page.locator('main > section').evaluateAll((s) => s.map((e) => e.id || e.getAttribute('aria-label')))
  expect(ids).toEqual(['top', 'how', 'journey', 'features', 'privacy', 'numbers', 'self-host', 'mcp', 'faq', 'Get started'])
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.locator('html')).toHaveClass(/js/)
  await expect(page.locator('link[rel=preload][as=font]')).toHaveCount(2)
})
