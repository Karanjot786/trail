import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', async (orig) => {
  const real = await orig<typeof import('../../api/client')>()
  const { activityApi } = await import('./testdata')
  return { ...real, api: activityApi() }
})

import { api } from '../../api/client'
import { invalidate } from '../../api/useQuery'
import { current, navigate, startRouter } from '../../shell/router'
import ActivityScreen from './index'
import { goals, state } from './testdata'
import { pathSteps } from './Sessions'
import { bannerText } from './Banner'

const A = api as unknown as Record<string, ReturnType<typeof vi.fn>>
function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 30)))

beforeEach(() => {
  invalidate()
  state.goals = goals
  for (const f of Object.values(A)) f.mockClear?.()
})
afterEach(cleanup)

describe('Activity', () => {
  it('has exactly the four tabs', async () => {
    visit('/activity?site=demo')
    render(<ActivityScreen />)
    const tabs = within(screen.getByRole('tablist', { name: 'Activity views' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Visitors', 'Sessions', 'Events', 'Paths'])
    fireEvent.click(tabs[2])
    expect(current().tab).toBe('events')
  })

  it('/people/visits lands on Sessions', async () => {
    visit('/people/visits?site=demo')
    expect(location.pathname).toBe('/activity/sessions')
    render(<ActivityScreen />)
    expect(screen.getByRole('tab', { name: 'Sessions' }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByRole('table', {}, { timeout: 2000 })).toBeTruthy()
  })

  it('Visitors: server-paged count, and a row opens v=', async () => {
    visit('/activity/visitors?site=demo')
    render(<ActivityScreen />)
    await screen.findByRole('table', {}, { timeout: 2000 })
    await flush()
    expect(screen.getByTestId('dt-count').textContent).toBe('120 people · 50 loaded')
    expect(A.visitors.mock.calls[0][1]).toMatchObject({ limit: 50, sort: '-last' })
    const row = screen.getByRole('row', { name: 'Open the journey of Visitor 3' })
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(location.search).toContain('v=p3')
    fireEvent.click(screen.getByRole('button', { name: 'Load 50 more' }))
    await flush()
    expect(A.visitors.mock.calls.at(-1)![1]).toMatchObject({ limit: 100 })
  })

  it('Load more resets after a filter change', async () => {
    visit('/activity/visitors?site=demo')
    render(<ActivityScreen />)
    await screen.findByRole('table', {}, { timeout: 2000 })
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Load 50 more' }))
    await flush()
    expect(A.visitors.mock.calls.at(-1)![1]).toMatchObject({ limit: 100 })
    const before = A.visitors.mock.calls.length
    act(() => navigate({ filters: [{ dim: 'country', value: 'IN' }] }))
    await flush()
    const after = A.visitors.mock.calls.slice(before).map((c) => c[1].limit)
    expect(after.length).toBeGreaterThan(0)
    expect(after).not.toContain(100)
    expect(after.at(-1)).toBe(50)
  })

  it('Sessions: sorting sends sort=-duration, and a row opens v=person~session', async () => {
    visit('/activity/sessions?site=demo')
    render(<ActivityScreen />)
    await screen.findByRole('table', {}, { timeout: 2000 })
    await flush()
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Duration/ })).getByRole('button'))
    await flush()
    expect(A.sessions.mock.calls.at(-1)![1]).toMatchObject({ sort: '-duration' })
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Duration/ })).getByRole('button'))
    await flush()
    expect(A.sessions.mock.calls.at(-1)![1]).toMatchObject({ sort: 'duration' })
    fireEvent.click(screen.getAllByRole('row', { name: /Open this session/ })[0])
    expect(decodeURIComponent(location.search)).toMatch(/v=p\d~s\d/)
  })

  it('Events: the columns, property chips, Outbound link, and a row opens evn=', async () => {
    visit('/activity/events?site=demo')
    render(<ActivityScreen />)
    const table = await screen.findByRole('table', {}, { timeout: 2000 })
    await flush()
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads).toEqual(['Event', 'Count', 'People', 'Last seen', 'Properties'])
    expect(within(table).getByText('Outbound link')).toBeTruthy()
    expect(within(table).getByText('plan')).toBeTruthy()
    expect(screen.getByTestId('events-n').textContent).toBe('2')
    fireEvent.click(screen.getByRole('row', { name: /^Signup: 54 times/ }))
    expect(current().sheet).toEqual({ kind: 'event', name: 'Signup' })
  })

  it('Paths: rows in server order, the ellipsis step, and the visit split', async () => {
    visit('/activity/paths?site=demo')
    render(<ActivityScreen />)
    await flush()
    await flush()
    const rows = await screen.findAllByTestId('path-row', {}, { timeout: 2000 })
    expect(rows.map((r) => within(r).getByText(/^\d+$/).textContent)).toEqual(['20', '9'])
    expect(within(rows[1]).getByText('…')).toBeTruthy()
    expect(A.paths.mock.calls[0][1]).toBe(7) // the stats conv goal
    expect(screen.getByText('Converted on visit 1')).toBeTruthy()
    expect(screen.getByText('56%')).toBeTruthy()
  })

  it('Paths: the no-goal empty state links to Conversions', async () => {
    state.goals = []
    visit('/activity/paths?site=demo')
    render(<ActivityScreen />)
    expect(await screen.findByText('Paths need a goal', {}, { timeout: 2000 })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Conversions' }).getAttribute('href')).toContain('/conversions/goals')
  })
})

describe('helpers', () => {
  it('builds the session path from entry, count and exit', () => {
    expect(pathSteps({ entry: '/', exit: '/pricing', pages: 5 })).toEqual(['/', '+3', '/pricing'])
    expect(pathSteps({ entry: '/', exit: '/a', pages: 2 })).toEqual(['/', '/a'])
    expect(pathSteps({ entry: '/', exit: '/', pages: 1 })).toEqual(['/'])
  })
  it('writes people over people', () => {
    expect(bannerText(129, 525, 'visitors')).toBe('129 · 25% of 525 visitors')
  })
})
