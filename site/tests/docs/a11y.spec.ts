import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const reps = ['/docs/quickstart', '/docs/install/rewrites', '/docs/tracking/privacy', '/docs/operations/configuration', '/docs/api/mcp', '/docs/changelog']

for (const p of reps) {
  test(`axe ${p}`, async ({ page }) => {
    await page.goto(p)
    const { violations } = await new AxeBuilder({ page }).analyze()
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
