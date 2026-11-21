/* Proto checks: 23 Activity tabs + G V + legacy redirect, 24 event catalogue and sheet, 25 journey visits strip,
 * 31 journey goal badge matches the step chips. Owner: F3. */
import { expect, test, titled, gate, type App } from './fixtures'

// Playwright records a test's file from the call site, so the wrappers live in each spec rather than in fixtures.ts.
const chk = (nums: number | number[], title: string, body: (app: App) => Promise<void>, opts: { phone?: boolean } = {}) =>
  test(titled(nums, title, opts), async ({ app }) => {
    gate()
    await body(app)
  })

const loc = (p: import('@playwright/test').Page) => p.evaluate(() => decodeURIComponent(location.pathname + location.search))

chk(23, 'Activity: Visitors, Sessions, Events, Paths; G V jumps there; ?view=visitors and /people redirect', async ({ page, goto }) => {
  await goto('/')
  await page.keyboard.press('g')
  await page.keyboard.press('v')
  await expect.poll(() => loc(page)).toContain('/activity')
  await expect(page.getByRole('tablist').first().getByRole('tab')).toHaveCount(4) // the screen chunk is lazy
  const tabs = await page.getByRole('tablist').first().getByRole('tab').allInnerTexts()
  expect(tabs.map((t) => t.replace(/\d+/g, '').trim())).toEqual(['Visitors', 'Sessions', 'Events', 'Paths'])
  await goto('/people/visits')
  await expect.poll(() => loc(page)).toContain('/activity')
  await goto('/?view=visitors')
  await expect.poll(() => loc(page)).toContain('/activity/visitors')
  await goto('/?person=abc')
  await expect.poll(() => loc(page)).toMatch(/\/activity\/visitors\?(.*&)?v=abc(&|$)/) // the shell may add site= first
})

chk(24, 'event catalogue: a row opens the event sheet; an occurrence opens that visitor journey', async ({ page, goto, api }) => {
  await goto('/activity/events')
  const rows = await api('events')
  expect(rows.length).toBeGreaterThan(0)
  const name: string = rows[0].name
  const table = page.getByRole('table')
  for (const c of ['Event', 'Count', 'People', 'Last seen', 'Properties']) await expect(table.getByRole('columnheader', { name: new RegExp(c) })).toBeVisible()
  await table.getByRole('row', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  expect(await loc(page)).toContain('evn=')
  await sheet.getByRole('button', { name: /journey|visitor/i }).first().click()
  expect(await loc(page)).toMatch(/[?&]v=/)
  expect(await loc(page)).not.toContain('evn=')
})

chk(25, 'journey: a visits strip, each visit jumps to its timeline section', async ({ page, goto, api }) => {
  const people = await api('visitors', { limit: '50' })
  const multi = people.find((p: any) => p.visits >= 3)
  expect(multi, 'a visitor with 3 or more visits').toBeTruthy()
  await goto(`/activity/visitors?v=${encodeURIComponent(multi.person)}`)
  const marks = page.getByRole('dialog').getByRole('button', { name: /^Visit \d/ })
  expect(await marks.count()).toBe(multi.visits)
  for (const m of await marks.all()) expect((await m.boundingBox())!.height).toBeGreaterThanOrEqual(32)
  await marks.nth(1).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: /Visit 2/ })).toBeFocused()
})

chk(31, 'journey goal badge comes from the same goal matches as the step chips', async ({ page, goto, api }) => {
  const people = await api('visitors', { limit: '200' })
  let found = 0
  for (const p of people.slice(0, 40)) {
    const j = await api('journey', { person: p.person })
    const hits = j.flatMap((s: any) => s.goals)
    if (!hits.length) continue
    await goto(`/activity/visitors?v=${encodeURIComponent(p.person)}`)
    for (const h of hits) await expect(page.getByRole('dialog')).toContainText(h.name)
    if (++found >= 3) break
  }
  expect(found).toBeGreaterThan(0)
})
