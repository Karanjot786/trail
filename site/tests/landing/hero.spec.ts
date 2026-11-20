import { test, expect } from '@playwright/test'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

const priv = gzipSync(readFileSync(new URL('../../../internal/ingest/t.p.js', import.meta.url)), { level: 9 }).length

test('art box', async ({ page }) => {
  await page.goto('/')
  const img = page.locator('.hero-art picture img')
  await expect(img).toHaveAttribute('width', '1600')
  await expect(img).toHaveAttribute('height', '1000')
  await expect(img).toHaveAttribute('fetchpriority', 'high')
  await expect(img).toHaveAttribute('decoding', 'async')
  expect(await img.getAttribute('loading')).toBeNull()
  await expect(page.locator('.hero-art picture source[type="image/avif"]:not([media])')).toHaveAttribute('srcset', /1x, .+ 2x$/)
  await expect(page.locator('.hero-art picture source[media="(max-width:700px)"]')).not.toHaveCount(0)
})

const VIEWPORTS: [number, number][] = [[1024, 768], [1280, 640], [1440, 900], [1920, 1080], [2560, 1440], [701, 900], [700, 900], [390, 844]]
for (const [w, h] of VIEWPORTS) {
  test(`labels clear the copy at every width: ${w}x${h}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const res = await page.evaluate(() => {
      const box = (e: Element) => e.getBoundingClientRect()
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
      const copy = ['.hero h1', '.hero .lede', '.hero .ctas .btn', '.hero .nums > div', '.hero .legend'].flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => (e as HTMLElement).offsetParent).map(box)
      const svg = [...document.querySelectorAll('.hero-art .steps')].find((s) => (s as HTMLElement).offsetParent)!
      const rings = [...svg.querySelectorAll('circle.ring')].filter((c) => !c.classList.contains('core')).map(box)
      return [...document.querySelectorAll('.hero-art .wp')].map((l, i) => {
        const r = box(l), c = rings[i], cx = c.left + c.width / 2, cy = c.top + c.height / 2
        const dx = Math.max(r.left - cx, 0, cx - r.right), dy = Math.max(r.top - cy, 0, cy - r.bottom)
        return { label: l.textContent, overlaps: copy.filter((b) => hit(r, b)).length, dist: Math.hypot(dx, dy), box: [r.left, r.top, r.right, r.bottom].map(Math.round) }
      })
    })
    expect(res).toHaveLength(4)
    for (const r of res) {
      expect(r.overlaps, `${r.label} ${r.box} overlaps the copy`).toBe(0)
      expect(r.dist, `${r.label} is far from its ring`).toBeLessThanOrEqual(40)
    }
  })
}

test('numbers are real', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.hero .nums dd').first()).toHaveText(`${priv.toLocaleString('en-US')} B`)
})

test('h1 is the LCP element', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'LCP API is Chromium only')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const tag = await page.evaluate(() => new Promise<string>((done) => {
    new PerformanceObserver((l) => {
      const e = l.getEntries().at(-1) as PerformanceEntry & { element?: Element }
      done(e.element ? `${e.element.tagName}#${e.element.id}` : 'none')
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  }))
  expect(tag).toBe('H1#hero-title')
})

test('load sequence: footsteps walk in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const names = await page.locator('.hero-art .steps-d circle.st').first().evaluate((c) => c.getAnimations().map((a) => (a as CSSAnimation).animationName))
  expect(names).toContain('step')
})

test('load sequence: reduced motion shows the final state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  expect(await page.locator('.hero-art').evaluate((a) => a.getAnimations({ subtree: true }).length)).toBe(0)
  await expect(page.locator('.hero-art .wp').first()).toHaveCSS('opacity', '1')
})
