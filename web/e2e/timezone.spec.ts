/* #46: reports are written in the server's zone, not the viewer's. A browser in Los Angeles reads the same numbers as an
 * API call that names no zone (the call MCP and scripts make). */
import { expect, test, titled, gate } from './fixtures'

test.use({ timezoneId: 'America/Los_Angeles' })

test(titled(46, 'a viewer in another time zone sees the server-zone numbers and sends no tz'), async ({ app }) => {
  gate()
  const { page } = app
  const sent: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/')) sent.push(r.url())
  })
  const res = await page.request.get('/api/stats?site=demo&range=today')
  expect(res.ok()).toBeTruthy()
  const truth = await res.json()
  await app.goto('/?site=demo&range=today')
  await expect(app.kpi('Visitors')).toContainText(truth.visitors.toLocaleString('en-US'))
  expect(sent.length).toBeGreaterThan(0)
  expect(sent.filter((u) => /[?&]tz=/.test(u))).toEqual([])
})
