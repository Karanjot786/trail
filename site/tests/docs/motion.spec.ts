import { test, expect, type Page } from '@playwright/test'

// Record every element.animate() call, so the assertions do not race the
// 180 ms animation itself.
async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    const w = window as any
    w.__anims = []
    const orig = Element.prototype.animate
    Element.prototype.animate = function (keyframes: any, options: any) {
      w.__anims.push({ el: this.className, keyframes, options })
      return orig.call(this, keyframes, options)
    }
  })
}
const anims = (page: Page) => page.evaluate(() => (window as any).__anims)

test('page enter runs on navigation, not on first load', async ({ page }) => {
  await recordAnimations(page)
  await page.goto('/docs/quickstart')
  expect(await anims(page)).toEqual([])
  await page.locator('.VPSidebar').getByRole('link', { name: 'Docker', exact: true }).click()
  await expect(page.locator('h1')).toHaveText('Docker')
  const [a] = await anims(page)
  expect(a.el).toContain('content-container')
  expect(a.options.duration).toBe(180)
  expect(a.options.easing).toBe('cubic-bezier(0.23, 1, 0.32, 1)')
  expect(a.keyframes[0].transform).toBe('translateY(4px)')
})

test('reduced motion: opacity only, 120 ms', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await recordAnimations(page)
  await page.goto('/docs/quickstart')
  await page.locator('.VPSidebar').getByRole('link', { name: 'Docker', exact: true }).click()
  await expect(page.locator('h1')).toHaveText('Docker')
  const [a] = await anims(page)
  expect(a.options.duration).toBe(120)
  for (const k of a.keyframes) expect(k).not.toHaveProperty('transform')
})

test('no animation on a hash-only change', async ({ page }) => {
  await recordAnimations(page)
  await page.goto('/docs/install/rewrites')
  await page.locator('.VPDocAsideOutline a').first().click()
  await expect(page).toHaveURL(/#/)
  await page.waitForTimeout(300)
  expect(await anims(page)).toEqual([])
})
