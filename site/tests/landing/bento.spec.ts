import { test, expect } from '@playwright/test'

test('six cards in order, with the named-clicks note', async ({ page }) => {
  await page.goto('/')
  const ids = await page.locator('#features article.card').evaluateAll((cs) => cs.map((c) => c.className.match(/(\w+)-card/)?.[1]))
  expect(ids).toEqual(['hero', 'live', 'goals', 'nc', 'origin', 'dh'])
  await expect(page.locator('.nc-card .note')).toHaveText('Works after consent or in full mode.')
})

test('hero chips carry --k in the HTML', async ({ page }) => {
  await page.goto('/')
  const html = await page.content()
  expect(html).toContain('--k:0')
  await expect(page.locator('.jcard .row .chip').first()).toHaveAttribute('style', /--k:\d/)
})

test('layout: 3 columns at 1440, 2 at 1100, 1 at 700', async ({ page }) => {
  for (const [w, n] of [[1440, 3], [1100, 2], [700, 1]] as const) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto('/')
    const cols = await page.locator('.bento').evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length)
    expect(cols, `at ${w}`).toBe(n)
  }
})

test.describe('touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test('no hover walk after a tap', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'isMobile is not supported in Firefox')
    await page.goto('/')
    const card = page.locator('.hero-card')
    await card.scrollIntoViewIfNeeded()
    await card.locator('.tx h3').tap()
    const moving = await card.evaluate((c) => c.getAnimations({ subtree: true }).filter((a) => (a as CSSAnimation).animationName?.startsWith('bento')).length)
    expect(moving).toBe(0)
  })
})
