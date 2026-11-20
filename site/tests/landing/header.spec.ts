import { test, expect } from '@playwright/test'
import { DEMO_URL, GITHUB_URL } from '../../src/config'

// Set TRAIL_STARS=off for both the build and this run to check the offline path.
const STARS_OFF = process.env.TRAIL_STARS === 'off'

test('nav items', async ({ page }) => {
  await page.goto('/')
  const links = page.locator('.site-head nav[aria-label="Main"] a.nl')
  await expect(links).toHaveText(['How it works', 'Docs', 'Numbers', 'Demo'])
  await expect(links.last()).toHaveAttribute('href', DEMO_URL)
})

test('github button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const gh = page.locator('.site-head').getByRole('link', { name: /GitHub/ })
  await expect(gh).toHaveAttribute('href', GITHUB_URL)
  expect((await gh.boundingBox())!.height).toBe(40)
  await expect(page.locator('.site-head .gh-star')).toContainText('Star')

  await page.setViewportSize({ width: 390, height: 844 })
  expect((await gh.boundingBox())!.height).toBe(44)
  await expect(page.locator('.site-head .gh-label')).toBeHidden()
  await expect(page.locator('.site-head .gh-star')).toBeHidden()
  for (const name of ['How it works', 'Numbers']) await expect(page.locator('.site-head a.nl', { hasText: name })).toBeHidden()
  for (const name of ['Docs', 'Demo']) await expect(page.locator('.site-head a.nl', { hasText: name })).toBeVisible()
})

test('star pill without a count', async ({ page }) => {
  await page.goto('/')
  const count = page.locator('.site-head [data-stars]')
  const text = (await count.textContent())!.trim()
  if (STARS_OFF || text === '') {
    expect(text).toBe('')
    await expect(count).toHaveCSS('display', 'none')
    await expect(page.locator('.site-head .gh')).toHaveAttribute('aria-label', 'Star Trail on GitHub')
  } else {
    expect(text).toMatch(/^· \d+(\.\d)?K?$/)
  }
})

test('state flips after the hero', async ({ page }) => {
  await page.goto('/')
  const head = page.locator('.site-head')
  await expect(head).toHaveAttribute('data-state', 'hero')
  await page.evaluate(() => {
    const r = document.getElementById('top')!.getBoundingClientRect()
    scrollTo({ top: r.bottom + scrollY, behavior: 'instant' })
  })
  await expect(head).toHaveAttribute('data-state', 'solid')
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
  await expect(head).toHaveAttribute('data-state', 'hero')
})

for (const w of [1280, 390]) {
  test(`hit areas at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 })
    await page.goto('/')
    for (const box of await page.locator('.site-head a.nl:visible').evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height)))
      expect(box).toBeGreaterThanOrEqual(44)
    const hit = await page.locator('.site-head .gh').evaluate((gh) => {
      const r = gh.getBoundingClientRect()
      const x = r.left + r.width / 2
      const probe = (y: number) => document.elementFromPoint(x, y)?.closest('.gh') === gh
      // 44px tall target: the pill itself, or the pill plus its ::after overlay 2px past each edge.
      return { h: r.height, top: r.height >= 44 || probe(r.top - 1.5), bottom: r.height >= 44 || probe(r.bottom + 1.5) }
    })
    expect(hit.top && hit.bottom).toBe(true)
  })
}
