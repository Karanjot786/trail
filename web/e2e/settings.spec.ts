/* Proto checks: 40 Add website form + test visit and checklist never disagree, 41 assistants tab with scoped token,
 * 42 share dialog says who can open it, expiry, revoke, 66 MCP token scope + test connection, 73 light Receiving badge
 * contrast. Owner: F5. */
import { expect, test, titled, gate, type App } from './fixtures'

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

// Token names are unique per workspace (409 on a repeat). Chromium and Firefox share one server, and a retry reruns
// against the same data, so each run names its token after the project and the attempt.
const tokenName = (base: string) => `${base} ${test.info().project.name} ${test.info().retry}`

const loc = (p: import('@playwright/test').Page) => p.evaluate(() => decodeURIComponent(location.pathname + location.search))

chk(40, 'Add website is a real form; the test visit and the checklist never disagree', async ({ page, goto, api }) => {
  await goto('/settings/sites')
  await page.getByRole('button', { name: /add website/i }).click()
  const dlg = page.getByRole('dialog', { name: /add website/i })
  await dlg.getByLabel(/name/i).fill('Shop')
  await dlg.getByLabel(/domain/i).fill('shop.example.com')
  await dlg.getByRole('button', { name: /add/i }).last().click()
  await expect(page.getByRole('main')).toContainText('shop.example.com')
  await goto('/settings/install?site=shop')
  const state = page.getByTestId('install-state')
  const checks = page.getByRole('list', { name: /checks/i })
  await expect(state).toContainText(/Waiting|Not receiving|waiting/i)
  expect(await checks.getByText(/fail|pending/i).count()).toBeGreaterThan(0)
  const live = await api('sites')
  expect(live.find((s: any) => s.id === 'shop')).toBeTruthy()
  await page.request.delete('/api/sites/shop?purge=1')
})

chk(41, 'assistants: Claude Desktop/claude.ai tab, inline named and scoped token, paste-ready config', async ({ page, goto }) => {
  await goto('/settings/assistants')
  for (const t of ['Claude Desktop / claude.ai', 'Claude Code', 'Cursor', 'VS Code', 'Codex']) await expect(page.getByRole('tab', { name: t })).toBeVisible()
  await page.getByRole('tab', { name: 'Cursor' }).click()
  await expect(page.getByRole('main')).toContainText('TRAIL_TOKEN')
  const name = tokenName('Cursor at work')
  await page.getByLabel(/token name/i).fill(name)
  await page.getByRole('radio', { name: /read/i }).check()
  await page.getByRole('button', { name: /create token/i }).click()
  await expect(page.getByRole('main')).toContainText(/trl_/)
  await expect(page.getByRole('main')).not.toContainText('${env:TRAIL_TOKEN}')
  await expect(page.getByRole('main')).toContainText(name)
})

chk(42, 'the share dialog says who can open it, sets an expiry, creates and revokes', async ({ page, goto }) => {
  await goto('/')
  await page.getByRole('button', { name: 'Share' }).click()
  const dlg = page.getByRole('dialog', { name: /share/i })
  await expect(dlg).toContainText(/Anyone with the link/)
  await expect(dlg).toContainText(/read-only/)
  await dlg.getByRole('radio', { name: /30 days/ }).check()
  await dlg.getByRole('button', { name: /create/i }).click()
  await expect(dlg).toContainText(/expires in 30 days/)
  await dlg.getByRole('button', { name: /revoke/i }).click()
  await expect(dlg.getByText(/expires in 30 days/)).toHaveCount(0)
})

chk(66, 'MCP: a site-scoped token chosen at creation; test connection succeeds and fails with a reason', async ({ page, goto }) => {
  await goto('/settings/assistants')
  await page.getByRole('button', { name: /test connection/i }).click()
  await expect(page.getByRole('status').filter({ hasText: /no token yet/i })).toBeVisible()
  await page.getByRole('checkbox', { name: /docs/ }).check()
  await page.getByLabel(/token name/i).fill(tokenName('docs only'))
  await page.getByRole('button', { name: /create token/i }).click()
  await expect(page.getByRole('main')).toContainText(/docs\.trail\.dev only/)
  await page.getByRole('button', { name: /test connection/i }).click()
  await expect(page.getByRole('status').filter({ hasText: /Connected/ })).toBeVisible()
})

chk(73, 'light theme: the Receiving badge on the selected Settings row is 4.5:1 or better', async ({ page, goto }) => {
  await goto('/settings/sites')
  await page.keyboard.press('t')
  const badge = page.getByTestId('status-receiving').first()
  const [fg, bg] = await badge.evaluate((e) => {
    let b: Element | null = e
    let bgc = 'rgba(0, 0, 0, 0)'
    while (b && /rgba\(0, 0, 0, 0\)|transparent/.test(bgc)) { bgc = getComputedStyle(b).backgroundColor; b = b.parentElement }
    return [getComputedStyle(e).color, bgc]
  })
  const rgb = (s: string) => s.match(/[\d.]+/g)!.slice(0, 3).map(Number)
  const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const [a, b2] = [lum(rgb(fg)), lum(rgb(bg))]
  expect((Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05)).toBeGreaterThanOrEqual(4.5)
  await page.keyboard.press('t')
  expect(await loc(page)).toContain('/settings')
})
