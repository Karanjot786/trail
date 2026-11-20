import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
// @ts-ignore
import { pages } from '../../scripts/pages.mjs'
import { changes } from '../../src/lib/changelog'

const title = (p: string) => {
  const f = p === '/docs' ? 'index' : p.replace(/^\/docs\//, '')
  const src = readFileSync(`docs/${f}.md`, 'utf8')
  return src.match(/^title:\s*(.+)$/m)![1].trim().replace(/^['"]|['"]$/g, '')
}

test('CostTable renders', async ({ page }) => {
  await page.goto('/docs/tracking/cost')
  // Timings come from tracker/bench/last.json, which is git-ignored: CI builds show sizes only.
  const hasBench = existsSync('../tracker/bench/last.json')
  await expect(page.locator('.vp-doc table')).toHaveCount(hasBench ? 2 : 1)
  if (!hasBench) await expect(page.locator('.vp-doc')).toContainText('Timings are not included in this build')
  const first = page.locator('.vp-doc table').first().locator('tbody tr')
  await expect(first).toHaveCount(3)
  const text = await first.allInnerTexts()
  for (const f of ['t.p.js', 't.js', 't.x.js']) expect(text.join('\n')).toContain(f)
})

test('every page has h1 equal to its frontmatter title', async ({ page }) => {
  test.setTimeout(120_000)
  for (const p of pages as string[]) {
    const res = await page.goto(p)
    expect(res!.status(), p).toBe(200)
    const h1 = page.locator('h1')
    await expect(h1, p).toHaveText(title(p))
  }
})

test('changelog ids match changelog.ts', async ({ page }) => {
  await page.goto('/docs/changelog')
  const ids = await page.locator('.vp-doc h2').evaluateAll((els) => els.map((e) => e.id))
  expect(ids).toEqual(changes.map((c) => c.id))
})

test('markdown twin', async ({ request }) => {
  const res = await request.get('/docs/quickstart.md')
  expect(res.status()).toBe(200)
  expect(await res.text()).toMatch(/^(---\n[\s\S]*?\n---\n+)?# Quickstart/)
})

test('copy as markdown', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  else {
    // Firefox has no clipboard-read permission in Playwright: stub the API and read the stub.
    await page.addInitScript(() => {
      const w = window as any
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: () => Promise.reject(new Error('stub')), writeText: async (t: string) => void (w.__clip = t) },
      })
    })
  }
  await page.goto('/docs/quickstart')
  await page.getByRole('button', { name: 'More copy options' }).click()
  await page.getByRole('menuitem', { name: 'Copy as Markdown' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  const text = browserName === 'chromium' ? await page.evaluate(() => navigator.clipboard.readText()) : await page.evaluate(() => (window as any).__clip)
  expect(text).toMatch(/^(---\n[\s\S]*?\n---\n+)?# Quickstart/)
})

test('quickstart steps are headings listed in the outline', async ({ page }) => {
  await page.goto('/docs/quickstart')
  await expect(page.locator('.vp-doc .steps h3')).toHaveCount(3)
  const links = page.locator('.VPDocAsideOutline a.outline-link')
  expect(await links.count()).toBeGreaterThanOrEqual(3)
  await expect(links.filter({ hasText: 'Start the server' })).toHaveCount(1)
})
