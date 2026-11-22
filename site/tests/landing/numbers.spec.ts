import { test, expect } from '@playwright/test'
import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync } from 'node:fs'
import { numbersCells } from '../../src/components/sections/numbers-cells'
import { numbers } from '../../src/copy/landing'

const repo = (p: string) => new URL('../../../' + p, import.meta.url)
const gz = (f: string) => gzipSync(readFileSync(repo('internal/ingest/' + f)), { level: 9 }).length
// tracker/bench/last.json is a local benchmark result (gitignored). Without it the page drops the timing cells, as
// the build does, so the check follows the same rule instead of failing on a fresh checkout such as CI.
const benchFile = repo('tracker/bench/last.json')
const bench = existsSync(benchFile) ? JSON.parse(readFileSync(benchFile, 'utf8')) : undefined
const B = (n: number) => `${n.toLocaleString('en-US')} B`

test('numbers are real', async ({ page }) => {
  await page.goto('/')
  const dd = page.locator('#numbers .ng dd')
  const t = bench?.results['t.js']
  const timings = t ? [`${t.script.median.toFixed(2)} ms`, `${t.heap.median.toFixed(0)} KB`] : []
  await expect(dd).toHaveText([B(gz('t.p.js')), B(gz('t.js')), ...timings, '2', /^\d+ MB$/, '30 MB', '0'])
  if (bench) await expect(page.locator('#numbers .lede')).toContainText(`median of ${bench.runs} runs`)
  else await expect(page.locator('#numbers .lede')).toHaveText(numbers.ledeNoBench)
  await expect(page.locator('#numbers .nfoot a')).toHaveAttribute('href', '/docs/tracking/cost')
  expect(await page.locator('#numbers .ridge svg').count()).toBe(1)
})

test('missing bench drops cells', () => {
  const { big, small } = numbersCells({ private: 1490, full: 2040 }, undefined)
  expect(big.map((c) => c.dd)).toEqual(['1,490 B', '2,040 B'])
  expect([...big, ...small].some((c) => / ms$| KB$/.test(c.dd))).toBe(false)
  expect(numbersCells({}, undefined).big).toEqual([])
})
