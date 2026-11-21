import { expect, test as base, type Locator, type Page } from '@playwright/test'

export { expect }

/** The fixed query every consistency check reads truth with: the demo site, last 30 days, in the viewer's zone. */
export const SITE = 'demo'
export const TZ = 'Asia/Kolkata'

export interface App {
  page: Page
  /** Navigates and waits for the shell to settle (no aria-busy region left). */
  goto(path: string): Promise<void>
  /** An authenticated GET of /api/*, returned as parsed JSON. `tz` and `site` default to the demo values. */
  api<T = any>(path: string, params?: Record<string, string>): Promise<T>
  /** A KPI tab from the strip (tablist "Metrics"), by its label prefix, e.g. kpi('Visitors'). */
  kpi(label: string): Locator
  /** Console errors and page errors collected so far. */
  errors: string[]
}

export const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
    })
    const app: App = {
      page,
      errors,
      async goto(path) {
        await page.goto(path)
        await page.waitForLoadState('domcontentloaded')
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
      },
      async api(path, params = {}) {
        const q = new URLSearchParams({ site: SITE, tz: TZ, ...params })
        const res = await page.request.get(`/api/${path.replace(/^\//, '')}?${q}`)
        expect(res.ok(), `${path} -> ${res.status()}`).toBeTruthy()
        return res.json()
      },
      kpi: (label) => page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab', { name: new RegExp(`^${label}\\b`) }),
    }
    await use(app)
    // A test fails on any console error or page error (plan T-1). Tests that provoke errors on purpose
    // (the failure and offline states) clear app.errors before they end.
    expect(errors, 'console errors or page errors').toEqual([])
  },
})

/** Test title for a ported prototype check. `nums` are the numbers in proto-d/test/interactions.cjs (1-based, file order). */
export const titled = (nums: number | number[] | null, title: string, opts: { phone?: boolean } = {}) =>
  `${nums === null ? '' : (Array.isArray(nums) ? nums : [nums]).map((n) => `#${n}`).join(' ') + ' '}${title}${opts.phone ? ' @phone' : ''}`

/** Every owned check is `fixme` until its owning builder has merged; CI sets E2E_ALL=1. Call first thing in a test body. */
export const gate = () => test.fixme(!process.env.E2E_ALL, 'waits for the owning builder to merge (set E2E_ALL=1)')

export const num = (s: string | null | undefined) => Number(String(s ?? '').replace(/[^0-9.\-]/g, ''))
export const region = (page: Page, name: string | RegExp) => page.getByRole('region', { name })
export const panel = (page: Page, heading: string) => page.getByRole('region', { name: heading, exact: true })

/** Mouse position of bucket i of n on the main chart figure. */
export async function pointAt(page: Page, i: number, n: number) {
  const box = await page.getByRole('figure').first().boundingBox()
  if (!box) throw new Error('no chart figure')
  return { x: box.x + box.width * (0.06 + 0.9 * (i / (n - 1))), y: box.y + box.height / 2 }
}

/** AI-visibility specs stay `fixme` until the owning builders merge (plan T-1); T-4 removes every call. Set E2E_AI=1 or E2E_ALL=1 to run them. */
export const aiGate = () => test.fixme(!process.env.E2E_AI && !process.env.E2E_ALL, 'waits for the AI-agents builders to merge (set E2E_AI=1)')
