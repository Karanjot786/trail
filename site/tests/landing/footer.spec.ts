import { test, expect } from '@playwright/test'
import { GITHUB_URL } from '../../src/config'

for (const w of [1440, 1280, 390]) {
  test(`word and links share a left edge at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto('/')
    const wordLeft = await page
      .locator('.foot-word path.fw-dots')
      .evaluateAll((ps) => Math.min(...ps.map((p) => p.getBoundingClientRect().left)))
    const linkLeft = await page.locator('.foot-links a').first().evaluate((a) => {
      const r = document.createRange()
      r.selectNodeContents(a)
      return r.getBoundingClientRect().left
    })
    expect(Math.abs(wordLeft - linkLeft)).toBeLessThanOrEqual(1)
  })
}

test('second line: licence and repo, no version', async ({ page }) => {
  await page.goto('/')
  const meta = page.locator('.foot-meta')
  await expect(meta).toContainText('MIT · Open source · Self-hosted')
  await expect(meta).not.toContainText(/v\d|\d+\.\d+\.\d+/)
  await expect(meta.locator(`a[href="${GITHUB_URL}"]`)).toBeVisible()
})

test('assembles once in view, final state persists', async ({ page }) => {
  await page.goto('/')
  const foot = page.locator('.site-foot')
  await expect(foot).not.toHaveAttribute('data-inview', /.*/)
  // Before entering view the dots wait in their pre-state.
  expect(await page.locator('path.fw-dots').first().evaluate((p) => getComputedStyle(p).opacity)).toBe('0')
  await foot.scrollIntoViewIfNeeded()
  await expect(foot).toHaveAttribute('data-inview', 'true')
  const allOpaque = (sel: string) => page.locator(sel).evaluateAll((els) => els.every((e) => getComputedStyle(e).opacity === '1'))
  await expect.poll(() => allOpaque('path.fw-dots')).toBe(true)
  await expect.poll(() => allOpaque('.fw-step')).toBe(true)
})

test('reduced motion: word visible with no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.locator('.site-foot').scrollIntoViewIfNeeded()
  const anims = await page.locator('.foot-word').evaluate((s) => s.getAnimations({ subtree: true }).length)
  expect(anims).toBe(0)
  expect(await page.locator('path.fw-dots').first().evaluate((p) => getComputedStyle(p).opacity)).toBe('1')
  expect(await page.locator('.fw-step').first().evaluate((p) => getComputedStyle(p).opacity)).toBe('1')
})

test('no JS: word visible', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  await page.goto('/')
  expect(await page.locator('path.fw-dots').first().evaluate((p) => getComputedStyle(p).opacity)).toBe('1')
  await ctx.close()
})
