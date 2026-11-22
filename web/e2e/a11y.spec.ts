/* T-3: axe on every screen and tab, every sheet kind, the palette, the ? sheet, the share view, offline Live, the
 * heatmap cell filter and the drop-off sheet; dark and light; chromium and firefox (projects). Zero violations of any
 * impact. Plus a contrast sample (port of proto-d/test/contrast.cjs): sampled text nodes per route at 4.5:1. */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

const ROUTES: [string, string][] = [
  ['overview', '/'], ['overview today', '/?range=today'], ['overview filtered', '/?f=source:Google'],
  ['all sites', '/?site=all'], ['live', '/live'],
  ['acquisition', '/acquisition'], ['acquisition ai', '/acquisition/ai'], ['acquisition campaigns', '/acquisition/campaigns'], ['acquisition landing', '/acquisition/landing'],
  ['visitors', '/activity/visitors'], ['sessions', '/activity/sessions'], ['events', '/activity/events'], ['paths', '/activity/paths'],
  ['goals', '/conversions/goals'], ['funnels', '/conversions/funnels'], ['revenue', '/revenue'], ['crawlers', '/crawlers'],
  ['settings sites', '/settings/sites'], ['settings install', '/settings/install'], ['settings assistants', '/settings/assistants'],
  ['settings tokens', '/settings/tokens'], ['settings sharing', '/settings/sharing'], ['settings data', '/settings/data'], ['settings config', '/settings/config'],
  ['sheet row', '/?dr=source|Google'], ['sheet report', '/?rep=sources:sources'], ['sheet event', '/activity/events?evn=Signup'],
  ['heatmap filter', '/?f=dow:2&f=hour:20'], ['empty heatmap', '/?f=country:JP'],
]

for (const theme of ['dark', 'light'] as const) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('trail.theme', t)
        } catch {
          /* private mode */
        }
      }, theme)
    })

    for (const [name, path] of ROUTES) {
      test(`axe: ${name} (${theme})`, async ({ app }) => {
        test.fixme(!process.env.E2E_ALL, 'waits for the owning builders to merge')
        await app.goto(path)
        const r = await new AxeBuilder({ page: app.page }).analyze()
        expect(r.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`)).toEqual([])
      })
    }

    for (const tab of ['funnel', 'crawlers', 'agents']) {
      test(`axe: /ai/${tab} (${theme})`, async ({ app }) => {
        await app.goto(`/ai/${tab}`)
        const r = await new AxeBuilder({ page: app.page }).analyze()
        expect(r.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`)).toEqual([])
      })
    }

    test(`axe: agent journey and the unlock card with its command (${theme})`, async ({ app }, info) => {
      const { page } = app
      // Tests share one server and the card names tokens per minute: tag the name so parallel runs never collide.
      await page.route('**/api/tokens', (route) => {
        const req = route.request()
        if (req.method() !== 'POST') return route.continue()
        const body = req.postDataJSON()
        return route.continue({ postData: JSON.stringify({ ...body, name: `${body.name} ${info.project.name} ${theme} a11y` }) })
      })
      await app.goto('/ai/agents')
      // CSS locators only before axe, not getByRole with a name: see the Firefox note on the command palette test.
      const table = page.locator('table', { has: page.locator('caption', { hasText: 'Latest agent sessions' }) })
      await table.locator('tbody tr:not([data-skeleton])').first().click()
      await expect(page.locator('[role=dialog] h3', { hasText: 'AI agent' }).first()).toBeVisible()
      // Firefox (Playwright's build) crashes the page in axe's aria-dialog-name rule, i.e. while computing this sheet's
      // accessible name (seen in CI on both themes, about 4 runs in 10 locally; every other rule is fine). There the
      // rule is replaced by the same check done by hand: the dialog is labelled by a heading with text.
      const axe = new AxeBuilder({ page })
      if (info.project.name === 'firefox') {
        axe.disableRules(['aria-dialog-name'])
        const by = await page.locator('[role=dialog]').getAttribute('aria-labelledby')
        expect(by).toBeTruthy()
        await expect(page.locator(`[id="${by}"]`)).toHaveText(/\S/)
      }
      expect((await axe.analyze()).violations).toEqual([])
      await page.keyboard.press('Escape')
      const made = page.waitForResponse((r) => r.url().includes('/api/tokens') && r.request().method() === 'POST' && r.status() === 201)
      await app.goto('/ai/funnel?site=docs')
      await page.getByRole('button', { name: 'Create token and copy command' }).click()
      const id = (await (await made).json()).id
      try {
        await expect(page.getByText(/^npx trail-analytics@latest init /)).toBeVisible()
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      } finally {
        await page.request.delete(`/api/tokens/${id}`)
      }
    })

    test(`axe: command palette and ? sheet (${theme})`, async ({ app }) => {
      test.fixme(!process.env.E2E_ALL, 'waits for the owning builders to merge')
      await app.goto('/')
      // Opened from the sidebar's search button. Opened with Ctrl+K under Playwright, axe-core 4.14's run never
      // returns in Firefox (the palette itself stays responsive; CommandPalette.test covers the shortcut).
      await app.page.getByRole('button', { name: /Search or jump to/ }).click()
      // Firefox (Playwright's build) segfaults the page (a null read in XUL) when axe runs after a getByRole query with
      // an accessible name on this dialog; CSS locators avoid that and check the same element.
      await expect(app.page.locator('[role=dialog][aria-label="Command palette"]')).toBeVisible()
      expect((await new AxeBuilder({ page: app.page }).analyze()).violations).toEqual([])
      await app.page.keyboard.press('Escape')
      await app.page.keyboard.press('Shift+?')
      await expect(app.page.locator('[role=dialog]', { hasText: 'Keyboard shortcuts' })).toBeVisible()
      expect((await new AxeBuilder({ page: app.page }).analyze()).violations).toEqual([])
    })

    test(`axe: journey and drop-off sheets, share view, offline Live (${theme})`, async ({ app }) => {
      test.fixme(!process.env.E2E_ALL, 'waits for the owning builders to merge')
      const { page } = app
      const people = await app.api('visitors', { limit: '1' })
      await app.goto(`/activity/visitors?v=${encodeURIComponent(people[0].person)}`)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      const f = (await app.api('funnels'))[0]
      await app.goto(`/conversions/funnels/${f.id}?fd=${f.id}:1`)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      const sh = await (await page.request.post('/api/shares', { data: { site: 'demo', label: 'a11y', state: 'range=30d', hideRevenue: false, ttl: '7d' } })).json()
      await app.goto(new URL(sh.url, 'http://x').pathname)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await page.request.delete(`/api/shares/${sh.id}`)
      await app.goto('/live')
      await page.context().setOffline(true)
      await expect(page.getByText(/offline/i).first()).toBeVisible()
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await page.context().setOffline(false)
      app.errors.length = 0
    })

    test(`contrast: sampled text nodes per route are 4.5:1 or better (${theme})`, async ({ app }) => {
      test.fixme(!process.env.E2E_ALL, 'waits for the owning builders to merge')
      for (const [name, path] of ROUTES.slice(0, 18)) {
        await app.goto(path)
        const bad = await app.page.evaluate(() => {
          const lin = (c: number) => {
            c /= 255
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          }
          const parse = (s: string) => (s.match(/[\d.]+/g) ?? ['0', '0', '0', '1']).map(Number)
          const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
          const bgOf = (start: Element | null): number[] => {
            for (let el = start; el; el = el.parentElement) {
              const c = parse(getComputedStyle(el).backgroundColor)
              if (c.length < 4 || c[3] > 0.9) return c
            }
            return parse(getComputedStyle(document.body).backgroundColor)
          }
          const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT)
          const nodes: Element[] = []
          for (let n = walker.nextNode(); n && nodes.length < 400; n = walker.nextNode()) {
            const el = n.parentElement
            if (el && (n.textContent ?? '').trim().length > 2 && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden') nodes.push(el)
          }
          const step = Math.max(1, Math.floor(nodes.length / 20))
          const out: string[] = []
          for (let i = 0; i < nodes.length; i += step) {
            const el = nodes[i]
            const a = lum(parse(getComputedStyle(el).color))
            const b = lum(bgOf(el))
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
            const size = parseFloat(getComputedStyle(el).fontSize)
            if (ratio < (size >= 24 ? 3 : 4.5)) out.push(`${(el.textContent ?? '').trim().slice(0, 30)} ${ratio.toFixed(2)}`)
          }
          return out
        })
        expect(bad, name).toEqual([])
      }
    })
  })
}
