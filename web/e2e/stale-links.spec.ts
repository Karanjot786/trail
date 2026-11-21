/* T-3 (Review Focus 5): stale references in the URL or a saved view give a calm state with a way back, never a crash. */
import { expect, test, titled, gate, type App } from './fixtures'
const check = (title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(null, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

const cases: [string, RegExp][] = [
  ['/conversions/goals/999', /This goal no longer exists/],
  ['/conversions/funnels/999', /This funnel no longer exists/],
  ['/conversions/funnels?fd=999:1', /no longer exists/],
  ['/activity/visitors?v=nobody', /no longer exists|not found|No journey/i],
  ['/?site=gone', /no longer exists|Pick a website|unknown site/i],
  ['/?v=gone', /no longer exists|not found/i],
]

for (const [path, msg] of cases) {
  check(`stale link ${path} shows a calm state with a way back`, async (app) => {
    await app.goto(path)
    // A stale sheet link (v=, fd=) answers inside its sheet, which hides the page behind it from assistive tech.
    await expect(app.page.locator('main, [role=dialog]').filter({ hasText: msg }).first()).toBeVisible()
    await expect(app.page.getByRole('link', { name: /back|overview|all/i }).or(app.page.getByRole('button', { name: /back|close/i })).first()).toBeVisible()
    app.errors.length = 0 // the 404 on the stale id is the expected network answer
  })
}

check('a saved view that points at a deleted goal opens calmly', async (app) => {
  const { page } = app
  const v = await (await page.request.post('/api/views', { data: { name: 'stale goal', site: 'demo', state: 'f=goal:__deleted__' } })).json()
  try {
    await app.goto('/')
    await page.getByRole('region', { name: 'Views' }).getByRole('link', { name: 'stale goal' }).click()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('main')).not.toContainText(/NaN|Infinity|Something went wrong/)
  } finally {
    await page.request.delete(`/api/views/${v.id}`)
    app.errors.length = 0
  }
})

test('/ai/bogus redirects to /ai/funnel (AI agents)', async ({ app }) => {
  await app.goto('/ai/bogus')
  await expect(app.page).toHaveURL(/\/ai\/funnel/)
  await expect(app.page.getByRole('tab', { name: 'Funnel', selected: true })).toBeVisible()
})
