import { test, expect } from '@playwright/test'
import { scrollThrough } from './helpers'

for (const v of [{ w: 1280, h: 800 }, { w: 390, h: 844 }]) {
  test(`CLS is 0 at ${v.w}x${v.h}`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h })
    await page.addInitScript(() => {
      ;(window as any).__cls = 0
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as any[]) if (!e.hadRecentInput) (window as any).__cls += e.value
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    await scrollThrough(page, 400, 150)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    // 0 on macOS. Linux CI renders fallback-font metrics a hair differently (~0.0001), the same reason the pixel test is
    // macOS-only. 0.001 is still 100x stricter than the 0.1 "good" threshold, so any real layout shift still fails.
    expect(await page.evaluate(() => (window as any).__cls)).toBeLessThan(0.001)
  })
}
