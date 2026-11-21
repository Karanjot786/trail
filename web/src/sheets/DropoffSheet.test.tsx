import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { DropoffPerson, FunnelReport } from '../api/types'
import { win } from '../shell/testkit'

const report: FunnelReport = {
  funnel: { id: 7, name: 'Docs to signup', windowMs: 7 * 86_400_000, created: 0, steps: [
    { kind: 'page', match: '/docs/*', label: 'Any /docs page' },
    { kind: 'page', match: '/pricing', label: '/pricing' },
  ] },
  window: win,
  started: 364,
  steps: [
    { label: 'Any /docs page', reached: 364, leftAfter: 289, fromStart: 1, fromPrev: 1, medianMsFromPrev: null },
    { label: '/pricing', reached: 75, leftAfter: 0, fromStart: 0.2, fromPrev: 0.2, medianMsFromPrev: 1000 },
  ],
  biggestDrop: { after: 1, people: 289 },
}
const people: DropoffPerson[] = [
  { person: 'p1', label: 'Visitor K7QD', lastVisit: 2000, exitPage: '/docs/install', source: 'Google' },
  { person: 'p2', label: 'ada@example.com', lastVisit: 1000, exitPage: '/docs', source: '' },
]

vi.mock('../api/client', async (orig) => {
  const real = await orig<typeof import('../api/client')>()
  return {
    ...real,
    api: {
      ...real.api,
      funnelReport: vi.fn(async (_q: URLSearchParams, id: number) => {
        if (id !== 7) throw new real.HttpError(404, 'funnel not found')
        return report
      }),
      funnelDropoff: vi.fn(async () => ({ rows: people, total: 289 })),
    },
  }
})

import { DropoffSheet } from './DropoffSheet'
import { startRouter } from '../shell/router'
import { invalidate } from '../api/useQuery'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
beforeEach(() => invalidate())
afterEach(cleanup)

describe('DropoffSheet', () => {
  it('counts everyone who left (the step’s leftAfter) and lists them newest first', async () => {
    visit('/conversions/funnels/7?site=demo&fd=7:1')
    render(<DropoffSheet />)
    const dlg = await screen.findByRole('dialog')
    expect(await within(dlg).findByText('289 people left after step 1')).toBeTruthy()
    const rows = await within(dlg).findAllByRole('row')
    expect(rows[1].textContent).toContain('Visitor K7QD')
    expect(rows[2].textContent).toContain('Came directly')
  })

  it('exports CSV with format=csv for this step', async () => {
    const hrefs: string[] = []
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      hrefs.push(this.href)
    })
    visit('/conversions/funnels/7?site=demo&fd=7:1')
    render(<DropoffSheet />)
    const dlg = await screen.findByRole('dialog')
    fireEvent.click(await within(dlg).findByRole('button', { name: /Export CSV/ }))
    spy.mockRestore()
    expect(hrefs).toHaveLength(1)
    expect(hrefs[0]).toMatch(/\/api\/funnels\/7\/dropoff\?/)
    expect(hrefs[0]).toMatch(/format=csv/)
    expect(hrefs[0]).toMatch(/step=1/)
  })

  it('a person opens their journey (v= replaces fd=), and Back brings the list back', async () => {
    visit('/conversions/funnels/7?site=demo&fd=7:1')
    render(<DropoffSheet />)
    const dlg = await screen.findByRole('dialog')
    fireEvent.click(await within(dlg).findByText('Visitor K7QD'))
    expect(location.search).toContain('v=p1')
    expect(location.search).not.toContain('fd=')
    await act(async () => {
      history.back()
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(location.search).toContain('fd=7')
  })

  it('a stale funnel id gives a calm state with a way out', async () => {
    visit('/conversions/funnels?site=demo&fd=999:1')
    render(<DropoffSheet />)
    const dlg = await screen.findByRole('dialog')
    expect(await within(dlg).findByText('This funnel no longer exists')).toBeTruthy()
    expect(within(dlg).getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0)
  })
})
