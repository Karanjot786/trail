import { test, expect } from '@playwright/test'

test('honest answer', async ({ page }) => {
  await page.goto('/')
  const a2 = page.locator('.ans .a2')
  await expect(a2).toContainText('counts each goal on its own')
  await expect(a2).toContainText('get_journey')
  await expect(a2).not.toContainText('rose by a third')
  await expect(page.locator('.t7')).toHaveText('7 tools')
  await expect(page.locator('.tools7 li')).toHaveCount(7)
})

test('json toggle, by mouse and keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const t = page.locator('.jtog'), json = page.locator('#cjson')
  await expect(t).toHaveAttribute('aria-expanded', 'false')
  await expect(json).toBeHidden()
  await t.click()
  await expect(t).toHaveAttribute('aria-expanded', 'true')
  await expect(json).toBeVisible()
  await t.focus()
  await page.keyboard.press('Enter')
  await expect(json).toBeHidden()
  await page.keyboard.press('Space')
  await expect(t).toHaveAttribute('aria-expanded', 'true')
  await expect(json).toBeVisible()
})

test('conversation plays once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const convo = page.locator('#convo')
  await convo.scrollIntoViewIfNeeded()
  await expect(convo).toHaveAttribute('data-seq', 'pre')
  await expect(convo).toHaveAttribute('data-seq', 'done', { timeout: 8000 })
  await expect(page.locator('.ans .a2')).toHaveCSS('opacity', '1')
})

test('reduced motion shows every turn', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const convo = page.locator('#convo')
  await convo.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await expect(convo).not.toHaveAttribute('data-seq', /.*/)
  for (const s of ['.you', '.call', '.ans .a1', '.atab', '.ans .a2']) await expect(page.locator(s)).toHaveCSS('opacity', '1')
})
