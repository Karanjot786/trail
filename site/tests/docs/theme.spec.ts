import { test, expect } from '@playwright/test'

test('table code never breaks inside a token', async ({ page }) => {
  await page.goto('/docs/api/read-api')
  const cells = page.locator('.vp-doc td code')
  expect(await cells.count()).toBeGreaterThan(10)
  const bad = await cells.evaluateAll((els) =>
    els
      .map((el) => {
        const cs = getComputedStyle(el)
        const first = el.closest('td')!.cellIndex === 0
        return { text: el.textContent, ws: cs.whiteSpace, wrap: cs.overflowWrap, first, lines: el.getClientRects().length }
      })
      .filter((c) => c.wrap === 'anywhere' || (c.first && (c.ws !== 'nowrap' || c.lines !== 1))),
  )
  expect(bad).toEqual([])
})

test('code blocks have one background', async ({ page }) => {
  await page.goto('/docs/quickstart')
  const pres = page.locator('.vp-doc div[class*="language-"] pre')
  expect(await pres.count()).toBeGreaterThan(0)
  const bgs = await pres.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
  for (const bg of bgs) expect(bg).toBe('rgba(0, 0, 0, 0)')
})

test('search trigger sits at the same x on every page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const xs: number[] = []
  for (const p of ['/docs/', '/docs/quickstart', '/docs/api/read-api']) {
    await page.goto(p)
    xs.push((await page.locator('.VPNavBarSearchButton').boundingBox())!.x)
  }
  expect(new Set(xs).size, xs.join(', ')).toBe(1)
})

test('steps are numbered by a CSS counter', async ({ page }) => {
  await page.goto('/docs/quickstart')
  const nums = await page
    .locator('.vp-doc .steps h3')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el, '::before').content))
  expect(nums.length).toBeGreaterThan(1)
  for (const n of nums) expect(n).toBe('counter(step)')
})
