import { test, expect } from '@playwright/test'
import { SECTION_IDS } from './helpers'
import { DEMO_URL, GITHUB_URL } from '../../src/config'

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
]

for (const v of viewports) {
  test(`landing is pixel-identical ${v.name}`, async ({ page }) => {
    // Baselines are rendered on macOS; Linux CI renders fonts differently (page height shifts),
    // so this guard runs locally only.
    test.skip(process.platform !== 'darwin', 'pixel baselines are macOS-rendered')
    await page.setViewportSize({ width: v.width, height: v.height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.locator('[data-stars]').evaluate((e) => (e.textContent = ''))
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r }))))
    })
    await expect(page).toHaveScreenshot(`landing-${v.name}.png`, { fullPage: true, maxDiffPixels: 0, animations: 'disabled' })
  })
}

test('sections are present in order', async ({ page }) => {
  await page.goto('/')
  const ids = await page.locator('main > section').evaluateAll((s) => s.map((e) => e.id || e.getAttribute('aria-label')))
  expect(ids).toEqual(SECTION_IDS)
  await expect(page.locator('#demo')).toHaveCount(0)
})

test('nav items in order, Demo included', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const links = page.locator('.site-head nav[aria-label="Main"] a.nl')
  await expect(links).toHaveText(['How it works', 'Docs', 'Numbers', 'Demo'])
  await expect(links.nth(3)).toHaveAttribute('href', DEMO_URL)
})

test('github button has a real count or none', async ({ page }) => {
  await page.goto('/')
  const gh = page.locator('.site-head').getByRole('link', { name: /GitHub/ })
  await expect(gh).toHaveAttribute('href', GITHUB_URL)
  await expect(gh).toHaveAttribute('target', '_blank')
  await expect(gh).toHaveAttribute('rel', /noopener/)
  const txt = (await page.locator('[data-stars]').textContent()) ?? ''
  expect(txt).toMatch(/^(|· \d+(\.\d)?K?)$/)
  if (process.env.TRAIL_STARS === 'off') expect(txt).toBe('')
  // the label never carries a hard-coded number
  expect(await page.locator('.site-head .gh-label').textContent()).not.toMatch(/\d/)
})

test('docs header has the same nav items as the landing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const landing = await page.locator('.site-head nav[aria-label="Main"] a.nl').allTextContents()
  await page.goto('/docs/quickstart')
  const docs = await page.locator('header nav[aria-label="Main"] a.nl').allTextContents()
  expect(docs).toEqual(landing)
  await expect(page.locator('header a.gh')).toHaveAttribute('href', GITHUB_URL)
  await expect(page.locator('header a.gh')).toHaveAttribute('target', '_blank')
})

for (const w of [390, 701, 1280]) {
  test(`no horizontal scroll at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    expect(o.sw).toBeLessThanOrEqual(o.cw)
  })
}

test('every GitHub link opens in a new tab', async ({ page }) => {
  for (const path of ['/', '/docs/quickstart']) {
    await page.goto(path)
    const links = page.locator(`a[href="${GITHUB_URL}"]`)
    const n = await links.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      await expect(links.nth(i)).toHaveAttribute('target', '_blank')
      await expect(links.nth(i)).toHaveAttribute('rel', /noopener/)
    }
  }
})
