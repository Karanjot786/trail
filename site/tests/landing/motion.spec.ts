import { test, expect } from '@playwright/test'
import { scrollThrough } from './helpers'

test.use({ reducedMotion: 'reduce' })

test('reduced motion: no transform animations after a full scroll', async ({ page }) => {
  await page.goto('/')
  await scrollThrough(page, 300, 100)
  const bad = await page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === 'running')
    .filter((a) => ((a.effect as KeyframeEffect)?.getKeyframes?.() ?? []).some((k) => 'transform' in k || 'translate' in k))
    .map((a) => (a.effect as KeyframeEffect).target?.tagName + '.' + (a.effect as KeyframeEffect).target?.className))
  expect(bad).toEqual([])
})
