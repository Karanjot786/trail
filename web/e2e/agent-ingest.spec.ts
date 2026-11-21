/* Real-browser agent ingest (plan T-1): a Claude-Agent user agent loads the real tracker; Trail classifies it from the
 * beacon it already sends, lists it on the Agents tab as Claimed, and leaves it out of human visitors. */
import { expect, test } from './fixtures'

const AGENT_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-Agent/1.0) Chrome/154.0.0.0 Safari/537.36'

test.describe('agent browser', () => {
  test.use({ userAgent: AGENT_UA, storageState: { cookies: [], origins: [] } })

  test('a Claude-Agent beacon becomes a Claimed agent session and no human visitor', async ({ browser, baseURL }) => {
    const base = baseURL!
    const owner = await browser.newContext({ storageState: 'test-results/.auth.json', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/130.0 Safari/537.36' })
    try {
      const before = await (await owner.request.get(`${base}/api/stats?site=demo&range=today&tz=Asia/Kolkata`)).json()

      const ctx = await browser.newContext({ userAgent: AGENT_UA })
      try {
        const page = await ctx.newPage()
        await page.route('https://demo.trail.dev/agent-test', (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html><title>agent test</title><h1>agent</h1><script src="/_t/t.js" data-site="demo" data-api="/_t/e" data-mode="full" defer></script>`,
          }),
        )
        // The tracker and its beacon go first-party, like the `/t/*` proxy from init: a public https page may not
        // reach a loopback server directly (Chromium's local network access check blocks it).
        await page.route('https://demo.trail.dev/_t/**', async (route) => {
          const u = new URL(route.request().url())
          // Firefox adds User-Agent below the interception layer, so pass the context's UA on, as a proxy would.
          const headers = { ...route.request().headers(), 'user-agent': AGENT_UA }
          await route.fulfill({ response: await route.fetch({ url: base + u.pathname + u.search, headers }) })
        })
        const beacon = page.waitForResponse((r) => r.url().endsWith('/_t/e'))
        await page.goto('https://demo.trail.dev/agent-test')
        expect((await beacon).status()).toBe(204)
      } finally {
        await ctx.close()
      }

      await expect
        .poll(
          async () => {
            const a = await (await owner.request.get(`${base}/api/agents?site=demo&range=today&tz=Asia/Kolkata`)).json()
            return (a.latest ?? []).some((s: { agent: string; via: string }) => s.agent === 'claude-agent' && s.via === 'ua')
          },
          { timeout: 20_000 },
        )
        .toBe(true)

      const page = await owner.newPage()
      await page.goto(`${base}/ai/agents?site=demo&range=today`)
      const row = page.getByRole('table', { name: 'Latest agent sessions' }).getByRole('row').filter({ hasText: 'Claude agent' }).first()
      await expect(row.getByText('Claimed', { exact: true })).toBeVisible()

      const after = await (await owner.request.get(`${base}/api/stats?site=demo&range=today&tz=Asia/Kolkata`)).json()
      expect(after.visitors, 'agents are left out of human visitors').toBe(before.visitors)
    } finally {
      await owner.close()
    }
  })
})
