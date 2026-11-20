import { test, expect } from '@playwright/test'

test('final state without the sequence', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.locator('#flow').scrollIntoViewIfNeeded()
  await expect(page.locator('#check')).toHaveClass(/\bon\b/)
  const rows = page.locator('#feed li')
  await expect(rows).toHaveCount(6)
  for (const li of await rows.all()) await expect(li).toBeVisible()
  await expect(page.locator('#goals .v')).toHaveText(['35339.5%', '28431.8%', '788.7%', '313.5%'])
  await expect(page.locator('#goals .reached')).toBeVisible()
  await expect(page.locator('.trail-seg[data-on]')).toHaveCount(2)
  expect(await page.locator('#flow').getAttribute('data-seq')).toBeNull()
})

test('sequence plays once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const flow = page.locator('#flow')
  await flow.scrollIntoViewIfNeeded()
  await expect(flow).toHaveAttribute('data-seq', 'pre')
  await expect(flow).toHaveAttribute('data-seq', 'done', { timeout: 8000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await flow.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await expect(flow).toHaveAttribute('data-seq', 'done')
  await expect(page.locator('#feed li')).toHaveCount(6)
  await expect(page.locator('#goals .v').first()).toHaveText('35339.5%')
  await expect(page.locator('#check .okt')).toHaveText(/last event (just now|\ds ago)/)
})

test('copy button in the stage copies the snippet', async ({ page, browserName, context }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium only')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const btn = page.locator('#flow .inst .copy')
  const want = await btn.getAttribute('data-copy')
  await btn.click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(want)
  await expect(btn).toHaveAttribute('aria-label', 'Copied')
})

for (const [w, dir] of [[1280, 'horizontal'], [390, 'vertical']] as const) {
  test(`trail segments are ${dir} at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto('/')
    const boxes = await page.locator('.trail-seg').evaluateAll((s) => s.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))
    const flow = (await page.locator('#flow').boundingBox())!
    expect(boxes).toHaveLength(2)
    for (const b of boxes) {
      expect(b.width > b.height).toBe(dir === 'horizontal')
      if (dir === 'vertical') expect(b.left - flow.x).toBeLessThan(40)
    }
  })
}
