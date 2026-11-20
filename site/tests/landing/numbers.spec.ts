import { test, expect } from '@playwright/test'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { numbersCells } from '../../src/components/sections/numbers-cells'

const repo = (p: string) => new URL('../../../' + p, import.meta.url)
const gz = (f: string) => gzipSync(readFileSync(repo('internal/ingest/' + f)), { level: 9 }).length
const bench = JSON.parse(readFileSync(repo('tracker/bench/last.json'), 'utf8'))
const B = (n: number) => `${n.toLocaleString('en-US')} B`

test('numbers are real', async ({ page }) => {
  await page.goto('/')
  const dd = page.locator('#numbers .ng dd')
  const t = bench.results['t.js']
  await expect(dd).toHaveText([
    B(gz('t.p.js')), B(gz('t.js')), `${t.script.median.toFixed(2)} ms`, `${t.heap.median.toFixed(0)} KB`,
    '2', /^\d+ MB$/, '30 MB', '0',
  ])
  await expect(page.locator('#numbers .lede')).toContainText(`median of ${bench.runs} runs`)
  await expect(page.locator('#numbers .nfoot a')).toHaveAttribute('href', '/docs/tracking/cost')
  expect(await page.locator('#numbers .ridge svg').count()).toBe(1)
})

test('missing bench drops cells', () => {
  const { big, small } = numbersCells({ private: 1490, full: 2040 }, undefined)
  expect(big.map((c) => c.dd)).toEqual(['1,490 B', '2,040 B'])
  expect([...big, ...small].some((c) => / ms$| KB$/.test(c.dd))).toBe(false)
  expect(numbersCells({}, undefined).big).toEqual([])
})
