import type { Page } from '@playwright/test'
import { gzipSync } from 'node:zlib'

export const SECTION_IDS = ['top', 'how', 'journey', 'features', 'privacy', 'numbers', 'self-host', 'mcp', 'faq', 'Get started']

/** Collects every JS response on a page load up to network idle and returns the gzip -9 total plus bodies. */
export async function collectJs(page: Page, url = '/') {
  const jobs: Promise<{ url: string; gz: number; text: string }>[] = []
  page.on('response', (r) => {
    const ct = r.headers()['content-type'] ?? ''
    if (/\.js(\?|$)/.test(r.url()) || ct.includes('javascript')) {
      jobs.push(r.body().then((b) => ({ url: r.url(), gz: gzipSync(b, { level: 9 }).length, text: b.toString('utf8') })))
    }
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  const rows = await Promise.all(jobs)
  return { rows, total: rows.reduce((n, r) => n + r.gz, 0) }
}

export async function scrollThrough(page: Page, step = 400, wait = 150) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y <= h; y += step) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await page.waitForTimeout(wait)
  }
}
