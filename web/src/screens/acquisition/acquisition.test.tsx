import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { Campaign, Row } from '../../api/types'
import { site, stats } from '../../shell/testkit'

const m = vi.hoisted(() => ({ revenue: false }))
const rows: Row[] = [
  { key: 'Google', visitors: 120, pageviews: 300, total: 300, sessions: 140, bounce: 0.4, convRate: 0.1, revenueMinor: 4200 },
  { key: 'GitHub', visitors: 60, pageviews: 90, total: 90, sessions: 70, bounce: 0.5, convRate: 0.05, revenueMinor: 0 },
]
const camp: Campaign = { source: 'newsletter', medium: 'email', campaign: 'launch', term: 'analytics', content: 'hero', visitors: 30, sessions: 33, bounce: 0.3, convRate: 0.2, revenueMinor: 1900 }

vi.mock('../../api/client', async (orig) => {
  const real = await orig<typeof import('../../api/client')>()
  return {
    ...real,
    api: {
      ...real.api,
      sites: vi.fn(async () => [site('demo', m.revenue)]),
      stats: vi.fn(async () => ({ ...stats(), conv: { goalId: 1, name: 'Signup' } })),
      breakdown: vi.fn(async () => ({ rows, total: rows.length })),
      aiReferrals: vi.fn(async () => ({ rows: [], total: 0 })),
      campaigns: vi.fn(async () => ({ rows: [camp], total: 1 })),
    },
  }
})

import Acquisition from './index'
import { startRouter } from '../../shell/router'
import { invalidate } from '../../api/useQuery'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
beforeEach(() => {
  invalidate()
  m.revenue = false
})
afterEach(cleanup)

describe('Acquisition', () => {
  it('hides the Revenue column on a site without purchases', async () => {
    visit('/acquisition?site=demo')
    render(<Acquisition />)
    const table = await screen.findByRole('table')
    await within(table).findByText('Google')
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads.some((h) => /Revenue/.test(h ?? ''))).toBe(false)
    expect(heads.some((h) => /Signup rate/.test(h ?? ''))).toBe(true)
  })

  it('shows "Revenue (first touch)" when the site has purchases, and the top row has a full bar', async () => {
    m.revenue = true
    visit('/acquisition?site=demo')
    render(<Acquisition />)
    const table = await screen.findByRole('table')
    await within(table).findByText('Google')
    expect(within(table).getByRole('columnheader', { name: /Revenue \(first touch\)/ })).toBeTruthy()
    const bars = table.querySelectorAll<HTMLElement>('[data-bar]')
    expect(bars[0].style.transform).toBe('scaleX(1)')
    expect(bars[1].style.transform).toBe('scaleX(0.5)')
  })

  it('a campaign row shows its five UTM tags as chips', async () => {
    visit('/acquisition/campaigns?site=demo')
    render(<Acquisition />)
    const table = await screen.findByRole('table')
    await within(table).findAllByText('launch')
    expect(table.querySelectorAll('[data-utm]').length).toBe(5)
    expect(within(table).getByRole('button', { name: 'Filter by UTM medium email' })).toBeTruthy()
  })

  it('asks for one website under All websites', async () => {
    visit('/acquisition?site=all')
    render(<Acquisition />)
    expect(await screen.findByText('Pick a website')).toBeTruthy()
  })
})
