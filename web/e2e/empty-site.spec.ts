/* T-3 (Review Focus 1): a brand-new site has no events, goals, funnels, purchases or crawler data. Every screen shows
 * its empty state and never NaN, Infinity or -100%. */
import { expect, test, titled, gate, type App } from './fixtures'
const check = (title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(null, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

const SCREENS = ['/', '/live', '/acquisition', '/acquisition/ai', '/acquisition/campaigns', '/acquisition/landing', '/activity/visitors', '/activity/sessions', '/activity/events', '/activity/paths', '/conversions/goals', '/conversions/funnels', '/revenue', '/crawlers', '/settings/sites', '/settings/install']

check('a fresh site: every screen renders an empty state with no NaN, Infinity or -100%', async (app) => {
  const { page } = app
  const res = await page.request.post('/api/sites', { data: { id: 'fresh', domain: 'fresh.example.com' } })
  expect(res.status()).toBe(201)
  try {
    for (const path of SCREENS) {
      await app.goto(`${path}${path.includes('?') ? '&' : '?'}site=fresh`)
      await expect(page.getByRole('main'), path).toBeVisible()
      const text = await page.getByRole('main').innerText()
      expect(text, path).not.toMatch(/NaN|Infinity|-100%|undefined|\[object/)
      expect(text.trim().length, `${path} is blank`).toBeGreaterThan(10)
    }
    for (const r of ['stats', 'series?metric=visitors', 'breakdown?dim=path', 'changes', 'heatmap', 'live', 'visitors', 'sessions', 'campaigns', 'ai-referrals', 'events', 'goals/report', 'revenue', 'crawlers']) {
      const [p, q = ''] = r.split('?')
      const a = await page.request.get(`/api/${p}?site=fresh&range=30d&tz=Asia/Kolkata&${q}`)
      expect(a.status(), r).toBe(200)
      expect(await a.text(), r).not.toMatch(/NaN|Infinity/)
    }
  } finally {
    await page.request.delete('/api/sites/fresh?purge=1')
  }
})
