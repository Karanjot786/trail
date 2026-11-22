import { test, expect } from '@playwright/test'

test('finder shows the WAL files', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.frow:not(.hd) > span:first-child')).toHaveText(['trail.db', 'trail.db-wal', 'trail.db-shm'])
  for (const r of await page.locator('.frow:not(.hd)').all()) {
    const name = await r.locator('span').first().innerText()
    if (name === 'trail.db') continue
    const dim = await r.evaluate((e) => e.classList.contains('dim') || Number(getComputedStyle(e).opacity) <= 0.6)
    expect(dim, name).toBe(true)
  }
  await expect(page.locator('.fstat')).toHaveText('3 items, 52.3 MB')
  await expect(page.locator('.fnote')).toContainText('-wal')
  await expect(page.locator('.fnote')).toContainText('-shm')
})

test('deploy tabs', async ({ page, context, browserName }) => {
  await page.goto('/')
  const code = page.locator('#shpre code')
  await page.locator('#dt-fly').click()
  expect(await code.textContent()).toBe(await page.locator('#shpre').getAttribute('data-fly'))
  await expect(page.locator('#dt-fly')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#dt-bin')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#dt-docker')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('#dt-bin')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#shpre')).toHaveAttribute('aria-labelledby', 'dt-bin')
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.locator('#shcode .copy').click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await page.locator('#shpre').getAttribute('data-bin'))
  }
})

test('skip mid-typing ends in the final state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const stage = page.locator('#tstage')
  await stage.scrollIntoViewIfNeeded()
  await expect(stage).toHaveAttribute('data-seq', 'pre')
  await expect(page.locator('#tskip')).toBeVisible()
  // The whole sequence lasts about two seconds, and a Playwright click's actionability wait can outlast that on a
  // busy runner. Check "still typing" and press Skip in one step in the page, so the skip always lands mid-typing.
  const midTyping = await page.locator('#tskip').evaluate((b: HTMLButtonElement) => {
    const typing = document.getElementById('tstage')!.dataset.seq === 'pre'
    b.click()
    return typing
  })
  expect(midTyping).toBe(true)
  await expect(stage).toHaveAttribute('data-seq', 'done')
  for (const l of await page.locator('.tl').all()) await expect(l).toBeVisible()
  await expect(page.locator('#upcard')).toBeVisible()
  await expect(page.locator('#upcard')).toHaveCSS('opacity', '1')
  // no scripted typing animation is left (CSS transitions settling and the caret's blink are fine)
  const running = await stage.evaluate((s) => s.getAnimations({ subtree: true }).filter((a) => a.constructor.name === 'Animation' && a.playState === 'running').length)
  expect(running).toBe(0)
  await expect(page.locator('#tskip')).toBeHidden()
})

test('reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const stage = page.locator('#tstage')
  await stage.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await expect(stage).not.toHaveAttribute('data-seq', /.*/)
  for (const l of await page.locator('.tl').all()) await expect(l).toBeVisible()
  await expect(page.locator('#upcard')).toHaveCSS('opacity', '1')
})
