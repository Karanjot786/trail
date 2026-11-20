import { test, expect } from '@playwright/test'
import { gzipSync } from 'node:zlib'

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
]

for (const v of viewports) {
  test(`landing is pixel-identical ${v.name}`, async ({ page }) => {
    // Baselines are rendered on macOS; Linux CI renders fonts differently (page height shifts),
    // so this guard runs locally only. The JS budget below still runs everywhere.
    test.skip(process.platform !== 'darwin', 'pixel baselines are macOS-rendered')
    await page.setViewportSize({ width: v.width, height: v.height })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`landing-${v.name}.png`, { fullPage: true, maxDiffPixels: 0, animations: 'disabled' })
  })
}

test('landing JS <= 4 KB gz', async ({ page }) => {
  let total = 0
  const pending: Promise<void>[] = []
  page.on('response', (r) => {
    const ct = r.headers()['content-type'] ?? ''
    if (r.url().endsWith('.js') || ct.includes('javascript')) {
      pending.push(r.body().then((b) => { total += gzipSync(b, { level: 9 }).length }))
    }
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  await Promise.all(pending)
  expect(total).toBeLessThanOrEqual(4096)
})
