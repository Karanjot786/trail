import { test, expect, type Page } from '@playwright/test'

const state = (page: Page) =>
  page.locator('#pm').evaluate((pm) => ({
    mode: pm.getAttribute('data-mode'),
    consent: pm.getAttribute('data-consent'),
    store: pm.getAttribute('data-store'),
    say: pm.querySelector('.say-t')!.innerHTML,
    attr: pm.querySelector('.attr')!.innerHTML,
    note: pm.querySelector('#vnote')!.textContent,
    rows: [...pm.querySelectorAll('.vrow')].map((r) => [r.querySelector('b')!.textContent, r.querySelector('small')!.textContent, r.className]),
    selected: [...pm.querySelectorAll('[role=tab]')].map((t) => [t.getAttribute('aria-selected'), (t as HTMLElement).tabIndex]),
    labelledby: pm.querySelector('#pm-panel')!.getAttribute('aria-labelledby'),
  }))

test('default', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#pm')).toHaveAttribute('data-mode', 'consent')
  await expect(page.locator('#pm')).toHaveAttribute('data-consent', 'no')
  await expect(page.locator('#pm')).toHaveAttribute('data-store', 'off')
  await expect(page.locator('.vrow')).toHaveCount(3)
  for (const r of await page.locator('.vwho').allInnerTexts()) expect(r.replace(/\s+/g, ' ')).toBe('Anonymous not followed')
  await expect(page.locator('.dt-t').first().locator('.dt-empty')).toBeVisible()
  await expect(page.locator('.dt-t').first().locator('.dt-empty')).toHaveText('No cookies')
  await expect(page.locator('.attr')).toContainText('no data-mode')
})

test('accept then reset', async ({ page }) => {
  await page.goto('/')
  await page.locator('#pm-accept').click()
  await expect(page.locator('.vwho b')).toHaveText(['Anonymous', 'Visitor 8f3c', 'Visitor 8f3c'])
  await expect(page.locator('#pm')).toHaveAttribute('data-store', 'on')
  await expect(page.locator('.dt-row.id').first()).toBeVisible()
  await expect(page.locator('#pm-undo')).toBeFocused()
  await page.locator('#pm-undo').click()
  await expect(page.locator('.vwho b')).toHaveText(['Anonymous', 'Anonymous', 'Anonymous'])
  await expect(page.locator('#pm')).toHaveAttribute('data-consent', 'no')
  await expect(page.locator('#pm-accept')).toBeFocused()
})

test('keyboard tabs', async ({ page }) => {
  await page.goto('/')
  const tab = (m: string) => page.locator(`#pm-${m}`)
  await tab('consent').focus()
  for (const [key, m] of [['ArrowRight', 'private'], ['End', 'full'], ['Home', 'consent'], ['ArrowLeft', 'full']] as const) {
    await page.keyboard.press(key)
    await expect(tab(m)).toBeFocused()
    await expect(tab(m)).toHaveAttribute('aria-selected', 'true')
    await expect(tab(m)).toHaveAttribute('tabindex', '0')
    await expect(page.locator('#pm-panel')).toHaveAttribute('aria-labelledby', `pm-${m}`)
    await expect(page.locator('#pm')).toHaveAttribute('data-mode', m)
  }
  await expect(page.locator('#pm [role=tab][tabindex="0"]')).toHaveCount(1)
})

test('rapid switching ends consistent', async ({ page, context }) => {
  await page.goto('/')
  const targets = ['#pm-consent', '#pm-private', '#pm-full', '#pm-accept', '#pm-undo']
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 20; i++) {
    const sel = targets[Math.floor(rnd() * targets.length)]
    await page.locator(sel).evaluate((b) => (b as HTMLElement).click()) // hidden banner buttons too: worst case
  }
  const end = await state(page)
  // A fresh page driven straight to the same (mode, consent) must match.
  const fresh = await context.newPage()
  await fresh.goto('/')
  if (end.consent === 'yes') await fresh.locator('#pm-accept').evaluate((b) => (b as HTMLElement).click())
  await fresh.locator(`#pm-${end.mode}`).click()
  expect(await state(fresh)).toEqual(end)
})

test.describe('no JS', () => {
  test.use({ javaScriptEnabled: false })
  test('server-rendered', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.vrow')).toHaveCount(3)
    await expect(page.locator('.say-t')).toContainText('trail.consent(true)')
    await expect(page.locator('#pm-consent')).toHaveAttribute('aria-selected', 'true')
  })
})
