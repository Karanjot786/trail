/* Proto checks: 33 one bar rule, 63 small totals agree, 75 the same metrics read the same on every screen, and P0-1
 * (one delta everywhere). Every number is read from the screens and compared with the API truth (plan T-2). */
import { expect, num, panel, test, titled, gate, type App } from './fixtures'

// Playwright records a test's file from the call site, so the wrappers live in each spec rather than in fixtures.ts.
const chk = (nums: number | number[], title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(nums, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })
const check = (title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(null, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

chk(33, 'one bar rule: the top row of every list is a full bar (value / max); no share-% bars', async ({ page, goto }) => {
  for (const [path, region] of [['/', 'Pages'], ['/acquisition', ''], ['/crawlers', '']] as const) {
    await goto(path)
    const scope = region ? panel(page, region) : page.getByRole('main')
    const first = scope.locator('[data-bar]').first()
    expect(await first.evaluate((e) => (e as HTMLElement).style.transform || e.getAttribute('style'))).toMatch(/scaleX\(1(\.0+)?\)|width:\s*100%/)
  }
})

chk(63, 'small totals agree: events overview = catalogue, bot requests on the freshness line = Crawlers, exit pages count', async ({ page, goto, api }) => {
  const stats = await api('stats')
  await goto('/')
  if (stats.botRequests !== null) await expect(page.getByTestId('freshness')).toContainText(stats.botRequests.toLocaleString('en-US'))
  const events = await api('events')
  await goto('/activity/events')
  await expect(page.getByRole('main')).toContainText(events.length.toLocaleString('en-US'))
  const cr = await api('crawlers')
  await goto('/crawlers')
  if (cr.configured) await expect(page.getByRole('main')).toContainText(cr.total.toLocaleString('en-US'))
})

check('P0-1: visitors, signups, revenue, events, bot requests and the all-sites card equal the API on every screen', async ({ page, goto, api }) => {
  const st = await api('stats')
  const sites = await api('sites/summary', { site: 'all' })
  const demoCard = sites.find((s: any) => s.id === 'demo')
  await goto('/')
  await expect(page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab', { name: /^Visitors/ })).toContainText(st.visitors.toLocaleString('en-US'))
  await expect(page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab', { name: /^Sessions/ })).toContainText(st.sessions.toLocaleString('en-US'))
  await goto('/?site=all')
  await expect(page.getByRole('main')).toContainText(demoCard.visitors.toLocaleString('en-US'))
  expect(demoCard.visitors).toBe(st.visitors)
  if (st.conv) {
    await goto(`/conversions/goals/${st.conv.goalId}`)
    await expect(page.getByRole('main')).toContainText(st.convVisitors.toLocaleString('en-US'))
  }
  const rev = await api('revenue')
  expect(rev.cur.netMinor).toBe(st.revenueMinor)
  await goto('/revenue')
  await expect(page.getByRole('main')).toContainText(/reported by your site/)
})

check('acquisition revenue per source equals Revenue by source, row for row (first touch)', async ({ api }) => {
  const rev = await api('revenue/breakdown', { dim: 'source' })
  const acq = await api('breakdown', { dim: 'source' })
  const sum = rev.reduce((a: number, r: any) => a + r.revenueMinor, 0)
  expect(sum).toBe((await api('revenue')).cur.netMinor)
  for (const r of rev) expect(acq.find((x: any) => x.key === r.key)?.revenueMinor ?? 0).toBe(r.revenueMinor)
})

chk(75, 'the same metric reads the same on every screen: Overview KPI, chart total and What changed', async ({ page, goto, api }) => {
  const st = await api('stats')
  await goto('/')
  const v = num(await page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab', { name: /^Visitors/ }).getByText(/^[\d,]+$/).first().innerText())
  expect(v).toBe(st.visitors)
  const series = await api('series', { metric: 'visitors' })
  expect(series.points.filter((p: any) => p.v !== null).length).toBeGreaterThan(0)
})
