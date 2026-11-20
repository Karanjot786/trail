import { test, expect } from '@playwright/test'
import { collectJs } from './helpers'

test('landing JS <= 15 KB gz', async ({ page }) => {
  const { rows, total } = await collectJs(page)
  console.log('landing JS gz bytes:', total, rows.map((r) => `${r.gz} ${r.url}`))
  expect(total).toBeLessThanOrEqual(15360)
})

test('no canvas, no getContext', async ({ page }) => {
  const { rows } = await collectJs(page)
  await expect(page.locator('canvas')).toHaveCount(0)
  for (const r of rows) expect(r.text, r.url).not.toContain('getContext(')
})

const arts = [
  { name: '1280 dpr1', width: 1280, height: 800, dpr: 1 },
  { name: '1280 dpr2', width: 1280, height: 800, dpr: 2 },
  { name: '390 dpr3', width: 390, height: 844, dpr: 3 },
]
for (const a of arts) {
  test(`hero art <= 80 KB at ${a.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: a.width, height: a.height }, deviceScaleFactor: a.dpr })
    const page = await ctx.newPage()
    let img = 0
    const jobs: Promise<void>[] = []
    page.on('response', (r) => { if (/hero-field/.test(r.url())) jobs.push(r.body().then((b) => { img += b.length })) })
    await page.goto('/', { waitUntil: 'networkidle' })
    await Promise.all(jobs)
    const svg = await page.evaluate(() => [...document.querySelectorAll('.hero-art svg')]
      .filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.outerHTML).join(''))
    const total = img + Buffer.byteLength(svg)
    console.log(`hero art ${a.name}: img ${img} + svg ${Buffer.byteLength(svg)} = ${total}`)
    expect(img).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(81920)
    await ctx.close()
  })
}

test('fonts preloaded before the first image', async ({ page }) => {
  const order: string[] = []
  page.on('request', (r) => {
    if (r.resourceType() === 'font') order.push('font')
    if (r.resourceType() === 'image') order.push('img')
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.locator('link[rel=preload][as=font][crossorigin]')).toHaveCount(2)
  const firstImg = order.indexOf('img')
  expect(order.slice(0, firstImg < 0 ? undefined : firstImg).filter((x) => x === 'font').length).toBeGreaterThanOrEqual(2)
})
