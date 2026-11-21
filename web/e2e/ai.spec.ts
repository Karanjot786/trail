/* AI visibility (plan T-1): the Funnel, Crawlers and Agents tabs, the legacy redirect, the Unlock card and the empty site. */
import { aiGate, expect, test } from './fixtures'

test('/crawlers redirects to /ai/crawlers and Back works', async ({ app }) => {
  aiGate()
  const { page } = app
  await app.goto('/?site=demo')
  await page.goto('/crawlers?site=demo')
  await expect(page).toHaveURL(/\/ai\/crawlers\?.*site=demo/)
  await expect(page.getByRole('tab', { name: 'Crawlers', selected: true })).toBeVisible()
  await page.goBack()
  await expect(page).not.toHaveURL(/\/ai\/crawlers/)
})

test('Funnel shows 5 steps and the cited step reads "No public source"', async ({ app }) => {
  aiGate()
  const { page } = app
  await app.goto('/ai/funnel?site=demo')
  const funnel = page.getByRole('region', { name: 'AI visibility funnel' })
  await expect(funnel).toBeVisible()
  await expect(funnel.getByRole('listitem')).toHaveCount(5)
  await expect(funnel).toContainText('No public source')
  const text = await funnel.innerText()
  expect(text).not.toMatch(/NaN|Infinity/)
})

test('Agents shows Verified and Claimed badges; a latest-session row opens an AI agent journey', async ({ app }) => {
  aiGate()
  const { page } = app
  await app.goto('/ai/agents?site=demo')
  await expect(page.getByText('Verified', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Claimed', { exact: true }).first()).toBeVisible()
  const table = page.getByRole('table', { name: 'Latest agent sessions' })
  await table.getByRole('row').nth(1).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: /AI agent/ })).toBeVisible()
})

test('the docs site shows the Unlock AI crawlers card as not receiving', async ({ app }) => {
  aiGate()
  const { page } = app
  await app.goto('/ai/funnel?site=docs')
  const card = page.getByRole('region', { name: 'Unlock AI crawlers' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Not receiving yet')
})

test.describe('create token', () => {
  let tokenId = ''
  test.afterEach(async ({ request }) => {
    if (!tokenId) return
    const res = await request.delete(`/api/tokens/${tokenId}`)
    expect([204, 404]).toContain(res.status())
    tokenId = ''
  })

  test('Create token and copy command shows one init command, and the token is revocable', async ({ app, context }) => {
    aiGate()
    const { page } = app
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined) // chromium only
    await app.goto('/ai/funnel?site=docs')
    const created = page.waitForResponse((r) => r.url().includes('/api/tokens') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Create token and copy command' }).click()
    const res = await created
    tokenId = (await res.json()).id
    expect((await res.request().postDataJSON()).scope).toBe('crawl')
    const cmd = page.getByRole('region', { name: 'Unlock AI crawlers' }).getByText(/^npx trail-analytics@latest init /)
    await expect(cmd).toBeVisible()
    expect((await cmd.innerText()).trim()).toMatch(/^npx trail-analytics@latest init --url http:\/\/127\.0\.0\.1:\d+ --site docs --token \S+$/)
  })
})

test('an empty site: every AI tab renders without NaN or Infinity', async ({ app }) => {
  aiGate()
  const { page } = app
  const res = await page.request.post('/api/sites', { data: { id: 'aiempty', domain: 'aiempty.example.com' } })
  expect(res.status()).toBe(201)
  try {
    for (const tab of ['funnel', 'crawlers', 'agents']) {
      await app.goto(`/ai/${tab}?site=aiempty`)
      await expect(page.getByRole('main')).toBeVisible()
      const text = await page.getByRole('main').innerText()
      expect(text, tab).not.toMatch(/NaN|Infinity|undefined|\[object/)
      expect(text.trim().length, tab).toBeGreaterThan(10)
    }
  } finally {
    await page.request.delete('/api/sites/aiempty?purge=1')
  }
})
