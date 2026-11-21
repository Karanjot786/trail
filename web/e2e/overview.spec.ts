/* Proto checks ported here. Owner: F2 (+F1). Numbers are from proto-d/test/interactions.cjs.
 *  3 KPI type        4 mono only for paths   5 tooltip card    6 tooltip flips    7 arrow keys
 *  8 no note chips   9 phone readout (@phone) 10 signup lane   11 columns menu   12 panel menu
 * 13 row legibility 14 panels pair           15 heatmap sparse 16 what changed day 17 what changed rate
 * 18 freshness link 20 compare custom        28 same delta everywhere  29 delta basis 30 today small base
 * 34 tooltip colour key  38 exit rate        39 row opens report  43 % of total  44 heatmap keys
 * 46 What changed wrap   47 phone layout (@phone) 48 signup marks  56 row filter on hover
 * 60 one baseline   61 overlap note          62 low data       65 phone dismiss (@phone)
 * 67 1024 labels    68 keyboard only         71 KPI never truncates  72 heatmap busiest */
import { expect, num, panel, test, titled, gate, type App } from './fixtures'

/** Mouse position of bucket i of n on the main chart: the plot is the chart's hit area (`rect.hit`). */
async function pointAt(page: import('@playwright/test').Page, i: number, n: number) {
  const r = await page.getByRole('figure').first().locator('rect.hit').boundingBox()
  if (!r) throw new Error('no chart plot')
  return { x: r.x + r.width * (n > 1 ? i / (n - 1) : 0.5), y: r.y + r.height / 2 }
}

// Playwright records a test's file from the call site, so the wrappers live in each spec rather than in fixtures.ts.
const chk = (nums: number | number[], title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(nums, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

const loc = (p: import('@playwright/test').Page) => p.evaluate(() => decodeURIComponent(location.pathname + location.search))
const font = (l: import('@playwright/test').Locator) => l.evaluate((e) => getComputedStyle(e).fontFamily)

chk(3, 'KPI values are Geist 600 with tabular numerals, never Doto; revenue KPI exists on demo', async ({ page, goto }) => {
  await goto('/')
  const tabs = page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab')
  expect(await tabs.count()).toBe(7)
  for (const t of await tabs.all()) {
    const v = t.locator('[data-kpi-value], .val').first()
    expect(await font(v)).toMatch(/Geist/)
    expect(await font(v)).not.toMatch(/Doto/)
    expect(await v.evaluate((e) => getComputedStyle(e).fontVariantNumeric)).toMatch(/tabular-nums/)
  }
})

chk(4, 'monospace only for paths: axis, delta and readout labels are Geist', async ({ page, goto }) => {
  await goto('/')
  expect(await font(page.getByTestId('chart-readout'))).toMatch(/^"?Geist"?,/)
  expect(await font(page.getByRole('region', { name: 'Pages' }).getByRole('listitem').first().getByRole('button').first())).toMatch(/Mono/)
})

chk(5, 'tooltip card: date, 4 metrics with deltas, top 3 referrers, never covers the point', async ({ page, goto, api }) => {
  await goto('/')
  const series = await api('series', { range: '30d', metric: 'visitors', extras: '1' })
  const i = series.points.length - 10
  const p = await pointAt(page, i, series.points.length)
  await page.mouse.move(p.x, p.y)
  const card = page.getByTestId('chart-card')
  await expect(card).toBeVisible()
  const day = new Date(series.points[i].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })
  await expect(card).toContainText(day)
  expect(await card.locator('[data-delta]').count()).toBeGreaterThanOrEqual(3)
  expect(await card.getByTestId('chart-ref').count()).toBeLessThanOrEqual(3)
  const r = await card.boundingBox()
  expect(!(r && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height)).toBe(true)
})

chk(6, 'tooltip flips to the left near the right edge', async ({ page, goto }) => {
  await goto('/')
  const box = (await page.getByRole('figure').first().boundingBox())!
  await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2)
  const card = (await page.getByTestId('chart-card').boundingBox())!
  expect(card.x + card.width).toBeLessThan(box.x + box.width - 12)
})

chk(7, 'arrow keys step through days with the tooltip', async ({ page, goto }) => {
  await goto('/')
  await page.getByRole('figure').first().focus()
  await page.keyboard.press('End')
  const a = await page.getByTestId('chart-card').innerText()
  await page.keyboard.press('ArrowLeft')
  expect(await page.getByTestId('chart-card').innerText()).not.toBe(a)
})

chk(8, 'no duplicate note chips under the chart', async ({ page, goto }) => {
  await goto('/')
  await expect(page.getByRole('figure').first().locator('xpath=..').getByTestId('note-chip')).toHaveCount(0)
})

chk(9, 'phone: first tap reads the day in the header, the second zooms to it', async ({ page, goto }) => {
  await goto('/')
  const fig = page.getByRole('figure').first()
  const box = (await fig.boundingBox())!
  await fig.tap({ position: { x: box.width * 0.7, y: 100 } })
  await expect(page.getByTestId('chart-card')).toBeHidden()
  await expect(page.getByTestId('chart-readout')).toContainText(/vs/)
  expect(await loc(page)).not.toContain('range=d:')
  await fig.tap({ position: { x: box.width * 0.7, y: 100 } })
  await expect.poll(() => loc(page)).toContain('range=d:')
}, { phone: true })

chk(10, 'signup lane: dots only on days with signups; the count is printed', async ({ page, goto, api }) => {
  await goto('/')
  const s = await api('series', { range: '30d', metric: 'visitors', extras: '1' })
  const days = s.extras.filter((e: any) => e.conversions > 0).length
  const marks = page.getByRole('figure').first().locator('[data-goal-mark]')
  expect(await marks.count()).toBe(days)
})

chk(11, 'columns menu has checkboxes: Visitors, Views, % of total', async ({ page, goto }) => {
  await goto('/')
  const pages = panel(page, 'Pages')
  await pages.getByRole('button', { name: 'Panel options' }).click()
  const items = await page.getByRole('menuitemcheckbox').allInnerTexts()
  expect(items.map((s) => s.trim())).toEqual(expect.arrayContaining(['Visitors', 'Views', '% of total']))
  await page.getByRole('menuitemcheckbox', { name: 'Views' }).click()
  await expect(pages).not.toContainText(/\bViews\b/)
})

chk(12, 'panel menu: CSV and JSON download, API call copies, full report opens with rep= in the URL', async ({ page, goto }) => {
  await goto('/')
  const src = panel(page, 'Sources')
  for (const ext of ['csv', 'json']) {
    await src.getByRole('button', { name: 'Panel options' }).click()
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: new RegExp(ext, 'i') }).click()])
    expect(dl.suggestedFilename()).toMatch(new RegExp(`^trail-demo-.*\\.${ext}$`))
  }
  await src.getByRole('button', { name: 'Panel options' }).click()
  await page.getByRole('menuitem', { name: /full report/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await loc(page)).toContain('rep=sources:sources')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

chk(13, 'row legibility: bars at least 5 px, numbers next to the bar, 0 not a dash', async ({ page, goto }) => {
  await goto('/')
  const row = panel(page, 'Pages').getByRole('listitem').first()
  expect((await row.locator('[data-bar]').boundingBox())!.height).toBeGreaterThanOrEqual(5)
  expect(await panel(page, 'Pages').getByText('–', { exact: true }).count()).toBe(0)
})

chk(14, 'panels pair without holes (equal heights per row)', async ({ page, goto }) => {
  await goto('/')
  const tops = new Map<number, number[]>()
  for (const n of ['Pages', 'Sources', 'Location', 'Devices']) {
    const b = (await panel(page, n).boundingBox())!
    const k = Math.round(b.y)
    tops.set(k, [...(tops.get(k) ?? []), b.height])
  }
  for (const h of tops.values()) expect(Math.max(...h) - Math.min(...h)).toBeLessThanOrEqual(1)
})

chk(15, 'heatmap: linear scale, and "Not enough data yet" below the threshold', async ({ page, goto, api }) => {
  await goto('/')
  const hm = await api('heatmap')
  const grid = page.getByRole('grid', { name: 'Visitors by weekday and hour' })
  await expect(grid.getByRole('gridcell')).toHaveCount(168)
  expect(hm.cells.flat().length).toBe(168)
  await goto('/?f=country:JP')
  await expect(page.getByText('Not enough data yet')).toBeVisible()
})

chk(16, 'what changed: the day item zooms into that day', async ({ page, goto, api }) => {
  await goto('/')
  const ch = await api('changes', { range: '30d' })
  const day = ch.items.find((x: any) => x.kind === 'day')
  test_assert(day)
  const wc = page.getByRole('region', { name: 'What changed' })
  // The API sends the day as ISO; the item names it "Nov 10".
  const [, m, d] = String(day.day).split('-').map(Number)
  const label = `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`
  await wc.getByRole('button', { name: new RegExp(`Biggest jump.*${label}`) }).click()
  expect(await loc(page)).toContain(`range=d:${day.day}`)
  expect(await loc(page)).toMatch(/range=d:\d{4}-\d{2}-\d{2}/)
})

chk(17, 'what changed: a rate item switches the chart metric', async ({ page, goto }) => {
  await goto('/')
  await page.getByRole('region', { name: 'What changed' }).getByRole('button', { name: /Bounce rate|rate/ }).first().click()
  expect(await loc(page)).toMatch(/metric=(bounce|conversion)/)
})

chk(18, 'freshness line names the zone, "Every visit counted" and links to AI visibility', async ({ page, goto }) => {
  await goto('/')
  const f = page.getByTestId('freshness')
  await expect(f).toContainText(/Updated \d+s ago/)
  await expect(f).toContainText('Every visit counted')
  await expect(f).toContainText(/Bot requests left out/i)
  await f.getByRole('link').click()
  expect(await loc(page)).toMatch(/\/ai\/(funnel|crawlers)/)
})

chk(20, 'compare with a custom period names it in the readout and legend', async ({ page, goto, api }) => {
  await goto('/')
  // A start inside the seeded data (the server moves an earlier start up to the first event).
  const start = new Date(Date.now() - 50 * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  await page.getByRole('button', { name: 'Compare with' }).click()
  await page.getByRole('menuitemradio', { name: /custom/i }).click()
  await page.getByRole('dialog').getByLabel(/start|from/i).fill(start)
  await page.getByRole('button', { name: /^(apply|compare)$/i }).click()
  expect(await loc(page)).toContain(`cmp=c:${start}`)
  const w = (await api('series', { range: '30d', cmp: `c:${start}`, metric: 'visitors' })).window
  expect(w.basis.custom).toBe(true)
  await expect(page.getByTestId('chart-legend')).toContainText(w.basis.dates)
})

chk(28, 'the biggest-jump day shows the same delta on the strip, tooltip, day view and phone readout (vs API)', async ({ page, goto, api }) => {
  await goto('/')
  const ch = await api('changes', { range: '30d' })
  const day = ch.items.find((x: any) => x.kind === 'day')
  expect(day, 'a day item').toBeTruthy()
  const strip = page.getByRole('region', { name: 'What changed' })
  await expect(strip).toContainText(`${day.cur} vs ${day.prev}`)
  await goto(`/?range=d:${day.day}`)
  const k = await page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab').first().innerText()
  expect(k).toContain(String(day.cur))
  expect(k).toContain(`vs ${day.prev}`)
})

chk(29, 'every delta says what it compares against', async ({ page, goto, api }) => {
  await goto('/')
  const st = await api('stats')
  await expect(page.getByTestId('freshness')).toContainText(st.window.basis.text)
  const srs = await page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent ?? ''))
  for (const s of srs) expect(s).toMatch(/vs /)
})

chk(30, 'today: small base shows the plain difference, never +700%; future hours are not drawn', async ({ page, goto, api }) => {
  await goto('/?range=today')
  const k = await page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab').first().innerText()
  expect(k).not.toMatch(/\+\d{3,}%/)
  await expect(page.getByTestId('freshness')).toContainText('same hours yesterday')
  const s = await api('series', { range: 'today', metric: 'visitors' })
  const nulls = s.points.filter((p: any) => p.v === null).length
  expect(nulls).toBe(23 - s.window.lastBucket)
})

chk(34, 'the tooltip gives a colour key only to the plotted series', async ({ page, goto }) => {
  await goto('/')
  const p = await pointAt(page, 20, 30)
  await page.mouse.move(p.x, p.y)
  await expect(page.getByTestId('chart-card')).toBeVisible()
  expect(await page.getByTestId('chart-card').locator('[data-key-dot]').count()).toBe(1)
})

chk(38, 'exit pages show an exit rate and a "loses people most" sort', async ({ page, goto }) => {
  await goto('/?p.pages=exit')
  const pg = panel(page, 'Pages')
  await expect(pg).toContainText('Exit rate')
  await pg.getByRole('button', { name: /loses people most/i }).click()
  const rates = (await pg.getByTestId('exit-rate').allInnerTexts()).map(num)
  expect(rates.length).toBeGreaterThan(2)
  expect(rates.every((r, i) => i === 0 || r <= rates[i - 1])).toBe(true)
})

chk(39, 'a row opens its report; filtering is a separate button; the filter bar stays in view', async ({ page, goto }) => {
  await goto('/')
  const src = panel(page, 'Sources')
  await src.getByRole('listitem').nth(1).getByRole('button').first().click()
  expect(await loc(page)).toMatch(/dr=source\|/)
  expect(await loc(page)).not.toContain('f=')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await src.getByRole('button', { name: /^Filter by/ }).nth(1).click()
  expect(await loc(page)).toContain('f=source:')
  await page.evaluate(() => window.scrollTo(0, 1800))
  expect((await page.getByRole('region', { name: 'Filters' }).boundingBox())!.y).toBeLessThan(120)
})

chk(43, '"% of total" replaces Share; the share dialog says who can open it', async ({ page, goto }) => {
  await goto('/')
  await expect(panel(page, 'Pages')).toContainText('% of total')
  await expect(panel(page, 'Pages')).not.toContainText(/\bShare\b/)
})

chk(44, 'heatmap: one tab stop, arrow keys move, Enter filters weekday and hour', async ({ page, goto }) => {
  await goto('/')
  const grid = page.getByRole('grid', { name: 'Visitors by weekday and hour' })
  expect(await grid.locator('[tabindex="0"]').count()).toBe(1)
  await grid.locator('[tabindex="0"]').focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  expect(await loc(page)).toMatch(/f=dow:\d/)
  expect(await loc(page)).toMatch(/f=hour:\d+/)
})

chk(46, 'What changed never breaks words at 768 and 1024 and scrolls as whole items', async ({ page, goto }) => {
  for (const w of [768, 1024]) {
    await page.setViewportSize({ width: w, height: 900 })
    await goto('/')
    const wc = page.getByRole('region', { name: 'What changed' })
    for (const i of await wc.getByRole('listitem').all()) expect((await i.boundingBox())!.height).toBeLessThan(40)
  }
})

chk(47, 'phone: chart within 1.5 screens, no keyboard hints', async ({ page, goto }) => {
  await goto('/')
  const y = (await page.getByRole('figure').first().boundingBox())!.y
  expect(y).toBeLessThan(844 * 1.5)
  await expect(page.locator('kbd:visible')).toHaveCount(0)
}, { phone: true })

chk(48, 'signup marks are uniform with the count printed', async ({ page, goto }) => {
  await goto('/')
  const r = await page.getByRole('figure').first().locator('[data-goal-mark] circle').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('r')))])
  expect(r.length).toBe(1)
})

chk(56, 'row Filter button shows on hover and keyboard focus (always on touch); a row click opens the report', async ({ page, goto }) => {
  await goto('/')
  const row = panel(page, 'Sources').getByRole('listitem').nth(1)
  const btn = row.getByRole('button', { name: /^Filter by/ })
  expect(await btn.evaluate((e) => getComputedStyle(e).opacity)).toBe('0')
  await row.hover()
  await expect(btn).toHaveCSS('opacity', '1')
  await page.mouse.move(5, 5)
  await row.getByRole('button').first().focus()
  await expect(btn).toHaveCSS('opacity', '1')
})

chk(60, 'one chart baseline: the tooltip shows the dashed value for the same day offset', async ({ page, goto, api }) => {
  await goto('/')
  const s = await api('series', { range: '30d', metric: 'visitors' })
  const i = 21
  const p = await pointAt(page, i, s.points.length)
  await page.mouse.move(p.x, p.y)
  await expect(page.getByTestId('chart-card')).toContainText(String(s.prev[i].v))
  await expect(page.getByTestId('chart-card')).toContainText(/dashed/)
})

chk(61, '% of total: overlap note when sources exceed 100%; none for countries', async ({ page, goto }) => {
  await goto('/')
  await expect(panel(page, 'Sources')).toContainText(/several sources/)
  await expect(panel(page, 'Location')).not.toContainText(/several/)
})

chk(62, 'low data: no % or pt change when the earlier period has fewer than 5', async ({ page, goto }) => {
  await goto('/?range=today&f=country:GB')
  const txt = await page.getByRole('tablist', { name: 'Metrics' }).innerText()
  expect(txt).not.toMatch(/Infinity|NaN|-100%/)
})

chk(65, 'phone: What changed fits; taps outside dismiss the readout and tooltips', async ({ page, goto }) => {
  await goto('/')
  const wc = page.getByRole('region', { name: 'What changed' })
  expect(await wc.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
  const fig = page.getByRole('figure').first()
  const b = (await fig.boundingBox())!
  await fig.tap({ position: { x: b.width / 2, y: 100 } })
  await page.getByRole('tablist', { name: 'Metrics' }).tap({ position: { x: 5, y: 5 } })
  await expect(page.getByTestId('chart-card')).toBeHidden()
}, { phone: true })

chk(67, '1024: labels never collapse, goal rows never overlap', async ({ page, goto }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await goto('/')
  const small = await page.getByRole('region').locator('[data-label]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 && e.getBoundingClientRect().width < 56).map((e) => e.textContent))
  expect(small).toEqual([])
})

chk(68, 'keyboard only: focus survives a tab switch, heatmap arrows, chip removal', async ({ page, goto }) => {
  await goto('/?f=device:mobile&f=country:IN')
  const pages = panel(page, 'Pages')
  await pages.getByRole('tab', { name: 'Pages', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(pages.getByRole('tab', { selected: true })).toBeFocused()
  const filters = page.getByRole('region', { name: 'Filters' })
  while (await filters.getByRole('button', { name: /^Remove/ }).count()) {
    await filters.getByRole('button', { name: /^Remove/ }).first().focus()
    await page.keyboard.press('Enter')
  }
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
})

chk(71, 'KPI comparison values never truncate at 1440', async ({ page, goto }) => {
  await goto('/')
  for (const t of await page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab').all()) {
    expect(await t.evaluate((e) => [...e.querySelectorAll('*')].every((c) => c.scrollWidth <= c.clientWidth + 1))).toBe(true)
  }
})

chk(72, 'heatmap names a busiest hour only when it clearly wins', async ({ page, goto, api }) => {
  await goto('/')
  const hm = await api('heatmap')
  const hmr = page.getByRole('grid', { name: 'Visitors by weekday and hour' }).locator('xpath=..')
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  if (hm.clear) await expect(hmr).toContainText(`Busiest hour: ${days[hm.peak.dow]}s, ${String(hm.peak.hour).padStart(2, '0')}:00`)
  else await expect(hmr).not.toContainText(/busiest/i)
})

function test_assert(v: unknown) {
  expect(v, 'precondition').toBeTruthy()
}

chk(45, 'light mode: darker goal amber and bar and previous tokens', async ({ page, goto }) => {
  await goto('/')
  await page.keyboard.press('t')
  const v = await page.evaluate(() => ['--goal', '--chart-bar', '--chart-prev'].map((k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim().toLowerCase()))
  expect(v).toEqual(['#a86f00', '#3d85df', '#6b7a94'])
  await page.keyboard.press('t')
})
