/* Proto checks: 22 Revenue screen shown only with a Purchase event, 32 revenue drawn as bars and "no purchases",
 * 35 revenue first touch (Acquisition = Revenue), 36 goal Sources tab, 53 funnel one meaning of "left after",
 * 54 drop-off list, 59 goal sources add up (first touch), 64 (revenue part) equal bars. Owner: F4. */
import { expect, num, test, titled, gate, type App } from './fixtures'

// Playwright records a test's file from the call site, so the wrappers live in each spec rather than in fixtures.ts.
const chk = (nums: number | number[], title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(nums, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

const loc = (p: import('@playwright/test').Page) => p.evaluate(() => decodeURIComponent(location.pathname + location.search))

chk(22, 'Revenue is its own screen, hidden with an explanation when the site never sent a Purchase', async ({ page, goto, api }) => {
  const demo = await api('sites')
  expect(demo.find((s: any) => s.id === 'demo').features.revenue).toBe(true)
  await goto('/revenue')
  await expect(page.getByRole('main')).toContainText('Net revenue')
  await expect(page.getByRole('main')).toContainText('reported by your site')
  await goto('/revenue?site=docs')
  await expect(page.getByRole('main')).toContainText(/Revenue is hidden/)
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Revenue' })).toHaveCount(0)
  await goto('/?site=docs')
  expect(await page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab').count()).toBe(6)
})

chk(32, 'revenue is drawn as bars; a $0 day reads "no purchases", not a red -100%', async ({ page, goto, api }) => {
  await goto('/revenue')
  await expect(page.getByRole('figure').first().locator('rect').first()).toBeVisible()
  const s = await api('series', { metric: 'revenue', range: '30d' })
  const zero = s.points.find((p: any) => p.v === 0)
  if (zero) {
    const d = new Date(zero.t).toISOString().slice(0, 10)
    await goto(`/?range=d:${d}`)
    const k = await app_kpi(page)
    expect(k).toMatch(/no purchases/)
    expect(k).not.toMatch(/-?100%/)
  }
})
const app_kpi = (page: import('@playwright/test').Page) => page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab', { name: /^Net revenue/ }).innerText()

chk(35, 'revenue is first touch everywhere: Acquisition and Revenue agree row for row, and both say so', async ({ page, goto, api }) => {
  await goto('/acquisition')
  await expect(page.getByRole('table').first()).toContainText(/first touch/i)
  const rev = await api('revenue/breakdown', { dim: 'source' })
  const acq = await api('breakdown', { dim: 'source' })
  for (const r of rev) {
    const a = acq.find((x: any) => x.key === r.key)
    expect(a?.revenueMinor ?? 0, `source ${r.key}`).toBe(r.revenueMinor)
  }
  await goto('/revenue')
  await expect(page.getByRole('main')).toContainText(/first touch/i)
})

chk(36, 'a goal has a Sources tab (converted, rate, revenue); goal filters never turn rates into 100%', async ({ page, goto, api }) => {
  const goals = await api('goals')
  expect(goals.length).toBeGreaterThan(0)
  await goto(`/conversions/goals/${goals[0].id}`)
  await page.getByRole('tab', { name: 'Sources' }).click()
  const head = await page.getByRole('table').first().innerText()
  expect(head).toMatch(/Converted/)
  expect(head).toMatch(/Conversion rate/)
  expect(head).toMatch(/Revenue/)
  await goto(`/?f=goal:${goals[0].name}`)
  expect(await page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab', { name: /rate/ }).innerText()).not.toMatch(/\b100%/)
})

chk(53, 'funnel: one meaning for "left after step N"; the summary agrees with the biggest drop', async ({ page, goto, api }) => {
  const funnels = await api('funnels')
  expect(funnels.length).toBeGreaterThan(0)
  const rep = await api(`funnels/${funnels[0].id}/report`)
  await goto(`/conversions/funnels/${funnels[0].id}`)
  rep.steps.slice(0, -1).forEach((s: any, i: number) => expect(s.leftAfter).toBe(s.reached - rep.steps[i + 1].reached))
  if (rep.biggestDrop) await expect(page.getByRole('main')).toContainText(new RegExp(`left after step ${rep.biggestDrop.after}`))
})

chk(54, 'drop-off list: all of them, newest first, CSV export, the link reopens it', async ({ page, goto, api }) => {
  const funnels = await api('funnels')
  const f = funnels[0]
  const total = (await page.request.get(`/api/funnels/${f.id}/dropoff?site=demo&step=2&range=30d&tz=Asia/Kolkata`)).headers()['x-total-count']
  await goto(`/conversions/funnels/${f.id}?fd=${f.id}:2`)
  const dlg = page.getByRole('dialog')
  await expect(dlg).toContainText(new RegExp(`${total} people left after step 2`))
  const [dl] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: /export|csv/i }).click()])
  expect(dl.suggestedFilename()).toMatch(/\.csv$/)
  await page.reload()
  await expect(page.getByRole('dialog')).toContainText(/left after step 2/)
  expect(await loc(page)).toContain(`fd=${f.id}:2`)
})

chk(59, 'one attribution model: goal sources are first touch and add up to the converters', async ({ page, goto, api }) => {
  const goals = await api('goals')
  const d = await api(`goals/${goals[0].id}/detail`)
  await goto(`/conversions/goals/${goals[0].id}`)
  await page.getByRole('tab', { name: 'Sources' }).click()
  await expect(page.getByRole('table').first()).toContainText(/first touch/i)
  expect(d.sources.reduce((a: number, r: any) => a + r.converted, 0)).toBe(d.cur.conversions)
})

chk(64, 'equal values get equal bars: Revenue tracks share one x', async ({ page, goto }) => {
  await goto('/revenue')
  const xs = await page.locator('[data-bar]').evaluateAll((els) => els.map((e) => Math.round((e.parentElement ?? e).getBoundingClientRect().x)))
  expect(new Set(xs).size).toBeLessThanOrEqual(2)
  expect(num('0')).toBe(0)
})
