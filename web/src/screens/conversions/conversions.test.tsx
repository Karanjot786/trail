import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { FunnelReport, GoalDetail, GoalRow } from '../../api/types'
import { site, stats, win } from '../../shell/testkit'

const m = vi.hoisted(() => ({ goalQ: [] as string[], createFunnel: 0, goalErr: null as null | Error, createGoalErr: null as null | Error }))

export const goalRow: GoalRow = { id: 1, name: 'Signup', kind: 'event', match: 'Signup', conversions: 60, visitors: 50, rate: 0.1, prev: { conversions: 40, visitors: 40, rate: 0.08 } }
const detail: GoalDetail = {
  goal: { id: 1, name: 'Signup', kind: 'event', match: 'Signup' },
  cur: { conversions: 60, visitors: 50, rate: 0.1 },
  prev: { conversions: 40, visitors: 40, rate: 0.08 },
  series: [{ t: 0, v: 3 }, { t: 1, v: 5 }],
  prevSeries: [{ t: 0, v: 2 }, { t: 1, v: 4 }],
  sources: [
    { key: 'Google', converted: 30, share: 0.6, visitors: 200, rate: 0.15, lowBase: false, revenueMinor: 3800 },
    { key: 'Reddit', converted: 20, share: 0.4, visitors: 15, rate: 0.5, lowBase: true, revenueMinor: 0 },
  ],
  landings: [],
  byVisit: { first: 30, second: 10, later: 10 },
}
export const report: FunnelReport = {
  funnel: { id: 7, name: 'Docs to signup', windowMs: 7 * 86_400_000, created: 0, steps: [
    { kind: 'page', match: '/docs/*', label: 'Any /docs page' },
    { kind: 'page', match: '/pricing', label: '/pricing' },
    { kind: 'event', match: 'Signup', label: 'Signup event' },
  ] },
  window: win,
  started: 364,
  steps: [
    { label: 'Any /docs page', reached: 364, leftAfter: 289, fromStart: 1, fromPrev: 1, medianMsFromPrev: null },
    { label: '/pricing', reached: 75, leftAfter: 55, fromStart: 75 / 364, fromPrev: 75 / 364, medianMsFromPrev: 151000 },
    { label: 'Signup event', reached: 20, leftAfter: 0, fromStart: 20 / 364, fromPrev: 20 / 75, medianMsFromPrev: 59000 },
  ],
  biggestDrop: { after: 1, people: 289 },
}

vi.mock('../../api/client', async (orig) => {
  const real = await orig<typeof import('../../api/client')>()
  const { HttpError } = real
  return {
    ...real,
    api: {
      ...real.api,
      sites: vi.fn(async () => [site('demo', true)]),
      stats: vi.fn(async () => stats()),
      goals: vi.fn(async () => [goalRow]),
      goalsReport: vi.fn(async (q: URLSearchParams) => {
        m.goalQ.push(q.toString())
        return [goalRow]
      }),
      goalDetail: vi.fn(async (_q: URLSearchParams, id: number) => {
        if (id !== 1) throw new HttpError(404, 'goal not found')
        return detail
      }),
      paths: vi.fn(async () => ({ goal: detail.goal, converters: 50, rows: [{ steps: ['Google', '/docs', '/pricing'], people: 12, share: 0.24 }] })),
      createGoal: vi.fn(async () => {
        if (m.createGoalErr) throw m.createGoalErr
        return detail.goal
      }),
      events: vi.fn(async () => ({ rows: [], total: 0 })),
      funnels: vi.fn(async () => [report.funnel]),
      funnelReport: vi.fn(async (_q: URLSearchParams, id: number) => {
        if (id !== 7) throw new HttpError(404, 'funnel not found')
        return report
      }),
      createFunnel: vi.fn(async () => {
        m.createFunnel++
        return report.funnel
      }),
    },
  }
})

import Conversions from './index'
import { HttpError } from '../../api/client'
import { startRouter } from '../../shell/router'
import { invalidate } from '../../api/useQuery'
import { GOAL_MSG } from '../../lib/goals'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)))
beforeEach(() => {
  invalidate()
  m.goalQ = []
  m.createFunnel = 0
  m.createGoalErr = null
})
afterEach(cleanup)

describe('Goals', () => {
  it('a goal filter is dropped from goal reports, so the rate is never 100% of converters', async () => {
    visit('/conversions/goals?site=demo&f=goal:Signup&f=country:IN')
    render(<Conversions />)
    await screen.findByText('10%')
    expect(m.goalQ.length).toBeGreaterThan(0)
    for (const q of m.goalQ) {
      expect(q).not.toMatch(/goal%3A/)
      expect(q).toMatch(/country%3AIN/)
    }
    expect(screen.queryByText('100%')).toBeNull()
  })

  it('goal detail Sources: first touch, converted adds up to the goal’s people, low-base rates get a *', async () => {
    visit('/conversions/goals/1?site=demo')
    render(<Conversions />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Sources' }))
    const table = await screen.findByRole('table')
    await within(table).findByText('Google')
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent ?? '')
    expect(heads).toEqual(expect.arrayContaining(['First-touch source', 'Converted', 'Conversion rate', 'Revenue (first touch)']))
    expect(screen.getByText(/50 of 50 converters are listed/)).toBeTruthy()
    expect(within(table).getByText(/fewer than 20 visitors/)).toBeTruthy()
    expect(table.querySelector<HTMLElement>('[data-bar]')!.style.transform).toBe('scaleX(1)')
  })

  it('an unknown goal id shows a calm stale state with a way back', async () => {
    visit('/conversions/goals/999?site=demo')
    render(<Conversions />)
    expect(await screen.findByText('This goal no longer exists')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Back to all goals/ })).toBeTruthy()
  })

  it('the goal dialog says what the server would say, in the same words', async () => {
    visit('/conversions/goals?site=demo')
    render(<Conversions />)
    fireEvent.click(await screen.findByRole('button', { name: /Add a goal/ }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Add goal' }))
    expect(within(dlg).getByText(GOAL_MSG.name)).toBeTruthy()
    fireEvent.change(within(dlg).getByLabelText('Name'), { target: { value: 'Signup' } })
    fireEvent.change(within(dlg).getByLabelText('Path'), { target: { value: '/signup' } })
    m.createGoalErr = new HttpError(400, 'bad goal: a goal named "Signup" already exists')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Add goal' }))
    expect(await within(dlg).findByText('A goal named "Signup" already exists.')).toBeTruthy()
  })
})

describe('Funnels', () => {
  it('the biggest drop-off tile and the step use the same number and words', async () => {
    visit('/conversions/funnels/7?site=demo')
    render(<Conversions />)
    const tile = await screen.findByTestId('biggest-drop')
    expect(tile.textContent).toContain('left after step 1')
    expect(tile.textContent).toContain('289 people reached Any /docs page, never /pricing')
    const step = document.querySelector('[data-left-step="1"]')!
    expect(step.textContent).toContain('289 left after step 1')
    expect(step.textContent).toContain('reached Any /docs page, never /pricing')
    expect(within(step as HTMLElement).getByRole('button', { name: /See all 289/ })).toBeTruthy()
  })

  it('step bars follow the one bar rule: reached / max reached', async () => {
    visit('/conversions/funnels/7?site=demo')
    render(<Conversions />)
    await screen.findByTestId('biggest-drop')
    const bars = [...document.querySelectorAll<HTMLElement>('[data-funnel-bar]')].map((b) => b.style.transform)
    expect(bars).toEqual(['scaleX(1)', `scaleX(${Number((75 / 364).toFixed(4))})`, `scaleX(${Number((20 / 364).toFixed(4))})`])
  })

  it('the funnel dialog blocks a one-step funnel', async () => {
    visit('/conversions/funnels?site=demo')
    render(<Conversions />)
    fireEvent.click(await screen.findByRole('button', { name: /New funnel/ }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.change(within(dlg).getByLabelText('Name'), { target: { value: 'One' } })
    fireEvent.change(within(dlg).getByLabelText('Step 1 path'), { target: { value: '/docs' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remove step 2' }))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create funnel' }))
    expect(within(dlg).getByText('A funnel needs at least 2 steps.')).toBeTruthy()
    await flush()
    expect(m.createFunnel).toBe(0)
  })

  it('an unknown funnel id shows a calm stale state', async () => {
    visit('/conversions/funnels/999?site=demo')
    render(<Conversions />)
    expect(await screen.findByText('This funnel no longer exists')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Back to all funnels/ })).toBeTruthy()
  })
})
