import { test, expect, type Page } from '@playwright/test'
import { GITHUB_URL } from '../../src/config'

const brand = (page: Page) =>
  page.locator('header .brand').evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    fontSize: getComputedStyle(el).fontSize,
  }))
const gh = (page: Page) =>
  page.locator('header .gh').evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    radius: getComputedStyle(el).borderTopLeftRadius,
  }))

test('header matches landing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const landing = { brand: await brand(page), gh: await gh(page) }
  await page.goto('/docs/quickstart')
  expect(await brand(page)).toEqual(landing.brand)
  expect(await gh(page)).toEqual(landing.gh)
  await expect(page.locator('header nav[aria-label="Main"] a.nl')).toHaveText(['How it works', 'Docs', 'Numbers', 'Demo'])
  await expect(page.locator('header nav[aria-label="Main"] a.nl.current')).toHaveText('Docs')
  await expect(page.locator('header .gh')).toHaveAttribute('href', GITHUB_URL)
  await expect(page.locator('header .gh-star')).toContainText('Star')
})

test('docs header stays dark', async ({ page }) => {
  await page.goto('/docs/quickstart')
  const lum = await page.locator('.TrailNavBar').evaluate((el) => {
    const [r, g, b] = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)!.map(Number).map((v) => v / 255)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  })
  expect(lum).toBeLessThan(0.1)
  await expect(page.locator('header .gh')).toHaveCSS('background-color', 'rgb(22, 22, 22)')
})

for (const w of [768, 960, 1024, 1100, 1280]) {
  test(`header fits at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 })
    await page.goto('/docs/quickstart')
    const r = await page.locator('.TrailNavBar').evaluate((bar) => {
      const box = (e: Element) => e.getBoundingClientRect()
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const nav = bar.querySelector('.nav')!
      const search = bar.querySelector('.VPNavBarSearchButton')!
      const items = [...bar.querySelectorAll('a.nl, .gh')].filter((e) => box(e).width > 0)
      return {
        // 2px slack: the GitHub button's ::after hit area sits 2px outside the pill on purpose.
        overflow: [nav, ...nav.children].some((e) => e.scrollWidth > e.clientWidth + 2),
        offscreen: items.some((e) => box(e).right > innerWidth),
        tops: new Set(items.filter((e) => e.matches('a.nl')).map((e) => Math.round(box(e).top))).size,
        overlap: items.some((e) => hit(box(e), box(search))) || hit(box(bar.querySelector('.brand')!), box(search)),
        visible: items.filter((e) => e.matches('a.nl')).map((e) => e.textContent!.trim()),
      }
    })
    expect(r.overflow).toBe(false)
    expect(r.offscreen).toBe(false)
    expect(r.tops).toBe(1)
    expect(r.overlap).toBe(false)
    expect(r.visible).toEqual(w >= 1100 ? ['How it works', 'Docs', 'Numbers', 'Demo'] : ['Docs', 'Demo'])
  })
}

test('footer meta line', async ({ page }) => {
  await page.goto('/docs/quickstart')
  await expect(page.locator('footer .foot-meta')).toContainText('MIT · Open source · Self-hosted')
  await expect(page.locator(`footer .foot-meta a[href="${GITHUB_URL}"]`)).toBeVisible()
})

test('no appearance toggle', async ({ page }) => {
  await page.goto('/docs/quickstart')
  await expect(page.locator('.VPSwitchAppearance')).toHaveCount(0)
})

test('leaves SPA for non-docs links', async ({ page }) => {
  await page.goto('/docs/quickstart')
  await page.evaluate(() => ((window as any).__spa = 1))
  await page.locator('header .brand').click()
  await page.waitForURL((u) => u.pathname === '/')
  expect(await page.evaluate(() => (window as any).__spa)).toBeUndefined()
})
