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

test('a fresh site: the three AI tabs and their reports render empty states (AI agents)', async ({ app }) => {
  const { page } = app
  // The Overview of a site with no events shows onboarding; this test wants the empty Overview behind it.
  await page.addInitScript(() => localStorage.setItem('trail.onboarding.skipped', JSON.stringify(['freshai'])))
  expect((await page.request.post('/api/sites', { data: { id: 'freshai', domain: 'freshai.example.com' } })).status()).toBe(201)
  try {
    for (const tab of ['funnel', 'crawlers', 'agents']) {
      await app.goto(`/ai/${tab}?site=freshai`)
      const text = await page.getByRole('main').innerText()
      expect(text, tab).not.toMatch(/NaN|Infinity|-100%|undefined|\[object/)
      expect(text.trim().length, tab).toBeGreaterThan(10)
    }
    for (const r of ['ai-visibility', 'agents', 'ai-setup']) {
      const a = await page.request.get(`/api/${r}?site=freshai&range=30d&tz=Asia/Kolkata`)
      expect(a.status(), r).toBe(200)
      expect(await a.text(), r).not.toMatch(/NaN|Infinity/)
    }
    const v = await (await page.request.get('/api/ai-visibility?site=freshai&range=30d&tz=Asia/Kolkata')).json()
    expect(v.steps.find((x: any) => x.key === 'crawled').status).not.toBe('ok')
    await app.goto('/?site=freshai')
    await expect(page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab', { name: /^Visitors/ })).toContainText('0')
  } finally {
    await page.request.delete('/api/sites/freshai?purge=1')
  }
})

test('a fresh site: its Overview opens onboarding at Install, and “I’ll do this later” shows the empty Overview', async ({ app }) => {
  const { page } = app
  expect((await page.request.post('/api/sites', { data: { id: 'freshonb', domain: 'freshonb.example.com' } })).status()).toBe(201)
  try {
    await app.goto('/?site=freshonb')
    await expect(page).toHaveURL(/\/welcome\/install\?site=freshonb$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Install the script' })).toBeVisible()
    await expect(page.locator('pre').first()).toContainText('data-site="freshonb"')
    await page.getByRole('button', { name: 'I’ll do this later' }).click()
    await expect(page).toHaveURL(/\/\?site=freshonb$/)
    await expect(page.getByRole('tablist', { name: 'Metrics' })).toBeVisible()
    // Other screens never redirect.
    await app.goto('/live?site=freshonb')
    await expect(page).toHaveURL(/\/live\?site=freshonb$/)
  } finally {
    await page.request.delete('/api/sites/freshonb?purge=1')
  }
})

test('onboarding verifies the first event and lands on the Overview', async ({ app }) => {
  const { page } = app
  expect((await page.request.post('/api/sites', { data: { id: 'freshv', domain: 'freshv.example.com' } })).status()).toBe(201)
  try {
    await app.goto('/welcome/verify?site=freshv')
    await expect(page.getByTestId('onb-status')).toContainText('Waiting for your first visit')
    await page.request.post('/_t/e', {
      headers: { Origin: 'https://freshv.example.com', 'Content-Type': 'text/plain' },
      data: JSON.stringify({ s: 'freshv', t: 'pageview', a: 'e2e-onb-1', ss: 'e2e-onb-s1', u: 'https://freshv.example.com/', env: 'production' }),
    })
    await expect(page.getByRole('heading', { level: 1, name: 'Receiving data' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Go to Overview/ }).click()
    await expect(page).toHaveURL(/\/\?site=freshv$/)
    await expect(page.getByRole('tablist', { name: 'Metrics' })).toBeVisible()
  } finally {
    await page.request.delete('/api/sites/freshv?purge=1')
  }
})
