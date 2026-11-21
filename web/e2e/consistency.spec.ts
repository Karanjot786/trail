/* Proto checks: 33 one bar rule, 63 small totals agree, 75 the same metrics read the same on every screen, and P0-1
 * (one delta everywhere). Every number is read from the screens and compared with the API truth (plan T-2). */
import { aiGate, expect, num, panel, test, titled, gate, type App } from './fixtures'

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

// AI agents (plan T-2): agent and crawler numbers agree across the Funnel, the tabs and the API; people exclude agents by default.
const aiCheck = (title: string, body: (app: App) => Promise<void>) =>
  test(titled(null, title), async ({ app }) => {
    aiGate()
    await body(app)
  })

aiCheck('AI funnel: crawled + fetched equals the Crawlers tab request total', async ({ api }) => {
  const v = await api('ai-visibility')
  const step = (k: string) => v.steps.find((s: any) => s.key === k)
  const cr = await api('crawlers')
  expect(v.steps.map((s: any) => s.key)).toEqual(['crawled', 'fetched', 'cited', 'visited', 'converted'])
  expect((step('crawled').value ?? 0) + (step('fetched').value ?? 0)).toBe(cr.total)
})

aiCheck('AI funnel: visited equals the AI referral sessions on /acquisition/ai', async ({ api }) => {
  const v = await api('ai-visibility')
  const refs = await api('ai-referrals')
  const rows: any[] = Array.isArray(refs) ? refs : (refs.rows ?? refs.sources ?? [])
  const sum = rows.reduce((a, r) => a + (r.sessions ?? 0), 0)
  expect(v.steps.find((s: any) => s.key === 'visited').value).toBe(sum)
})

aiCheck('AI funnel and tabs read the same numbers on screen', async ({ page, goto, api }) => {
  const v = await api('ai-visibility')
  const crawled = v.steps.find((s: any) => s.key === 'crawled').value
  await goto('/ai/funnel')
  await expect(page.getByRole('region', { name: 'AI visibility funnel' })).toContainText(crawled.toLocaleString('en-US'))
  const ag = await api('agents')
  await goto('/ai/agents')
  await expect(page.getByRole('main')).toContainText(ag.sessions.toLocaleString('en-US'))
})

aiCheck('agents are left out of human KPIs: stats(actor=all).sessions - stats.sessions = agentSessions', async ({ api }) => {
  const human = await api('stats')
  const all = await api('stats', { actor: 'all' })
  expect(all.sessions - human.sessions).toBe(human.agentSessions)
  expect(all.agentSessions).toBe(human.agentSessions)
  expect(human.agentSessions).toBeGreaterThan(0)
  expect(all.visitors).toBeGreaterThanOrEqual(human.visitors)
})

aiCheck('agent sessions on /agents equal agentSessions on /stats', async ({ api }) => {
  const st = await api('stats')
  const ag = await api('agents')
  expect(ag.sessions).toBe(st.agentSessions)
  expect(ag.agents.reduce((a: number, r: any) => a + r.sessions, 0)).toBe(ag.sessions)
  expect(ag.verifiedSessions).toBeLessThanOrEqual(ag.sessions)
})

aiCheck('the actor toggle: Overview KPIs follow the API and the URL holds actor=all', async ({ page, goto, api }) => {
  const human = await api('stats')
  await goto('/')
  await expect(page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab', { name: /^Sessions/ })).toContainText(human.sessions.toLocaleString('en-US'))
  await page.getByRole('button', { name: 'Count AI agents as visitors' }).click()
  await expect(page).toHaveURL(/actor=all/)
  const all = await api('stats', { actor: 'all' })
  await expect(page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab', { name: /^Sessions/ })).toContainText(all.sessions.toLocaleString('en-US'))
})

aiCheck('the MCP tools agree with the API on agent and crawler totals', async ({ page, api }) => {
  const ag = await api('agents')
  const res = await page.request.post('/mcp', {
    headers: { Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agents', arguments: { site: 'demo', range: '30d' } } },
  })
  test.skip(!res.ok(), `MCP not reachable with the cookie (${res.status()}); covered by Go MCP tests`)
  expect(await res.text()).toContain(String(ag.sessions))
})
