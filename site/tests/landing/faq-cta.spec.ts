import { test, expect } from '@playwright/test'
import { DEMO_URL } from '../../src/config'

for (const js of [true, false]) {
  test.describe(js ? 'faq' : 'faq, no JS', () => {
    test.use({ javaScriptEnabled: js })
    test('six questions, the first open, toggles on click', async ({ page }) => {
      await page.goto('/')
      const d = page.locator('#faq details')
      await expect(d).toHaveCount(6)
      await expect(d.first()).toHaveAttribute('open', '')
      await expect(d.nth(1)).not.toHaveAttribute('open', /.*/)
      await d.nth(1).locator('summary').click()
      await expect(d.nth(1)).toHaveAttribute('open', '')
      await d.first().locator('summary').click()
      await expect(d.first()).not.toHaveAttribute('open', /.*/)
    })
  })
}

test('cta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const btn = page.locator('section.cta .band .btn')
  await expect(btn).toHaveAttribute('href', DEMO_URL)
  expect(await page.locator('.band svg circle').count()).toBeGreaterThan(0)
  // the walk's last step lands just left of the button
  const gap = await page.evaluate(() => {
    const b = document.querySelector('.band .btn')!.getBoundingClientRect()
    const cs = [...document.querySelectorAll('.band .walk circle')].map((c) => c.getBoundingClientRect())
    const last = cs.reduce((a, c) => (c.right > a.right ? c : a))
    return { dx: b.left - last.right, dy: Math.abs(last.top + last.height / 2 - (b.top + b.height / 2)) }
  })
  expect(gap.dx).toBeGreaterThanOrEqual(0)
  expect(gap.dx).toBeLessThanOrEqual(40)
  expect(gap.dy).toBeLessThanOrEqual(40)
})
