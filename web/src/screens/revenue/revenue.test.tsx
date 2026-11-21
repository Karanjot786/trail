import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { Revenue, RevenueRow } from '../../api/types'
import { basis, site, stats, win } from '../../shell/testkit'

const m = vi.hoisted(() => ({ revenue: true, rev: null as unknown as Revenue }))
const rows: RevenueRow[] = [
  { key: 'Google', revenueMinor: 17400, purchases: 6, buyers: 5, share: 0.6 },
  { key: '', revenueMinor: 6800, purchases: 2, buyers: 2, share: 0.25 },
  { key: 'Reddit', revenueMinor: 4500, purchases: 2, buyers: 1, share: 0.15 },
]
const full = (): Revenue => ({
  currency: 'USD',
  otherCurrencyPurchases: 2,
  cur: { netMinor: 28700, purchases: 10, buyers: 8, aovMinor: 2870 },
  prev: { netMinor: 34800, purchases: 12, buyers: 12, aovMinor: 2900 },
  series: [{ t: 0, v: 1900 }, { t: 1, v: 0 }, { t: 2, v: 26800 }],
  prevSeries: [{ t: 0, v: 0 }, { t: 1, v: 1900 }, { t: 2, v: 0 }],
  purchases: [{ ts: 5, person: 'p1', label: 'Visitor K7QD', sessionId: 's1', amountMinor: 1900, plan: 'pro', visitsBefore: 3 }],
})

vi.mock('../../api/client', async (orig) => {
  const real = await orig<typeof import('../../api/client')>()
  return {
    ...real,
    api: {
      ...real.api,
      sites: vi.fn(async () => [site('demo', m.revenue), site('docs', false)]),
      stats: vi.fn(async () => ({ ...stats(), window: { ...win, prevFrom: 0, prevTo: 1, basis } })),
      revenue: vi.fn(async () => m.rev),
      revenueBreakdown: vi.fn(async () => ({ rows, total: rows.length })),
    },
  }
})

import RevenueScreen from './index'
import { PURCHASE_SNIPPET } from './Hidden'
import { startRouter } from '../../shell/router'
import { invalidate } from '../../api/useQuery'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
beforeEach(() => {
  invalidate()
  m.revenue = true
  m.rev = full()
})
afterEach(cleanup)

describe('Revenue', () => {
  it('says "reported by your site" on the screen and in the Net revenue hint, and that it is first touch', async () => {
    visit('/revenue?site=demo')
    render(<RevenueScreen />)
    const cap = await screen.findByTestId('revenue-caption')
    expect(cap.textContent).toMatch(/reported by your site/)
    expect(cap.textContent).toMatch(/first touch/)
    expect(screen.getByRole('button', { name: 'Net revenue is reported by your site' })).toBeTruthy()
    expect(screen.getByText(/2 purchases in other currencies are not/)).toBeTruthy()
  })

  it('zero revenue reads "no purchases", with no red pill', async () => {
    m.rev = { ...full(), cur: { netMinor: 0, purchases: 0, buyers: 0, aovMinor: 0 }, purchases: [], series: [{ t: 0, v: 0 }] }
    visit('/revenue?site=demo')
    render(<RevenueScreen />)
    await screen.findByTestId('revenue-caption')
    expect(screen.getAllByText('no purchases').length).toBeGreaterThan(0)
    for (const d of document.querySelectorAll('.delta')) {
      if (/Net revenue/.test(d.closest('div')?.textContent ?? '')) expect(d.getAttribute('data-tone')).not.toBe('bad')
    }
    expect(document.body.textContent).not.toMatch(/−100%|-100%/)
  })

  it('the breakdown adds up to net revenue, with bars by value / max', async () => {
    visit('/revenue?site=demo')
    render(<RevenueScreen />)
    const list = await screen.findByRole('list', { name: /Revenue by first touch source/ })
    const sum = [...list.querySelectorAll('[data-rev]')].reduce((a, li) => a + Number(li.getAttribute('data-rev')), 0)
    expect(sum).toBe(28700)
    expect(within(list).getByTestId('rev-total').textContent).toContain('$287')
    expect(list.querySelector<HTMLElement>('[data-bar]')!.style.transform).toBe('scaleX(1)')
    expect(within(list).getByText('Came directly')).toBeTruthy()
  })

  it('hidden without a Purchase: explains, with the one-line snippet', async () => {
    visit('/revenue?site=docs')
    render(<RevenueScreen />)
    expect(await screen.findByText('Revenue is hidden for docs.trail.dev')).toBeTruthy()
    expect(screen.getByText(PURCHASE_SNIPPET)).toBeTruthy()
  })
})
