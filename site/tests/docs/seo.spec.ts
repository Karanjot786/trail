import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
// @ts-ignore
import { pages } from '../../scripts/pages.mjs'

const O = 'https://trail.karanjot.dev'

test('every page has one h1, description, canonical', async ({ page }) => {
  test.setTimeout(120_000)
  for (const p of pages as string[]) {
    await page.goto(p)
    await expect(page.locator('h1'), p).toHaveCount(1)
    expect((await page.locator('meta[name=description]').getAttribute('content'))?.trim(), p).toBeTruthy()
    await expect(page.locator('link[rel=canonical]'), p).toHaveAttribute('href', O + p)
  }
})

test('llms.txt lists 36 md links', () => {
  const t = readFileSync('dist/docs/llms.txt', 'utf8')
  expect(t.match(/\]\([^)]*\.md\)/g)?.length).toBe(36)
})

test('sitemap has landing and quickstart', () => {
  const x = readFileSync('dist/docs/sitemap.xml', 'utf8')
  expect(x).toContain(`<loc>${O}/</loc>`)
  expect(x).toContain(`<loc>${O}/docs/quickstart</loc>`)
})

test('rss links to docs changelog', () => {
  expect(readFileSync('dist/changelog.xml', 'utf8')).toContain('/docs/changelog#v2')
})
