import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/client', async (orig) => {
  const real = await orig<typeof import('../api/client')>()
  const { activityApi } = await import('../screens/activity/testdata')
  return { ...real, api: activityApi() }
})

import { invalidate } from '../api/useQuery'
import { current, startRouter } from '../shell/router'
import { IST, journey, state } from '../screens/activity/testdata'
import { JourneySheet } from './JourneySheet'
import { EventSheet } from './EventSheet'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 30)))

beforeEach(() => {
  invalidate()
  state.journey = journey()
})
afterEach(cleanup)

describe('JourneySheet', () => {
  it('shows the goal badge from the data, the totals and a strip button per visit', async () => {
    visit('/activity/visitors?site=demo&v=p9')
    render(<JourneySheet />)
    await flush()
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByTestId('goal-badge').textContent).toBe('2 goals: Pricing · visit 1, Signup · visit 3')
    expect(within(dlg).getByText('Pricing goal')).toBeTruthy()
    expect(within(dlg).getByText('Reached the Signup goal')).toBeTruthy()
    const marks = within(dlg).getAllByRole('button', { name: /^Visit \d/ })
    expect(marks).toHaveLength(3)
    fireEvent.click(marks[1])
    expect(document.activeElement).toBe(within(dlg).getByRole('heading', { name: /^Visit 2/ }))
  })

  it('`]` moves focus to the next visit, `[` back', async () => {
    visit('/activity/visitors?site=demo&v=p9')
    render(<JourneySheet />)
    await flush()
    const dlg = screen.getByRole('dialog')
    const h1 = within(dlg).getByRole('heading', { name: /^Visit 1/ })
    h1.focus()
    act(() => void window.dispatchEvent(new CustomEvent('trail:visit', { detail: 1 })))
    expect(document.activeElement).toBe(within(dlg).getByRole('heading', { name: /^Visit 2/ }))
    act(() => void window.dispatchEvent(new CustomEvent('trail:visit', { detail: 1 })))
    expect(document.activeElement).toBe(within(dlg).getByRole('heading', { name: /^Visit 3/ }))
    act(() => void window.dispatchEvent(new CustomEvent('trail:visit', { detail: -1 })))
    expect(document.activeElement).toBe(within(dlg).getByRole('heading', { name: /^Visit 2/ }))
  })

  it('the order toggle lists the newest visit first; the strip and Visit numbers stay', async () => {
    visit('/activity/visitors?site=demo&v=p9')
    render(<JourneySheet />)
    await flush()
    const dlg = screen.getByRole('dialog')
    const order = () => within(dlg).getAllByRole('heading', { level: 3 }).filter((h) => h.classList.contains('visit-h')).map((h) => h.textContent?.match(/Visit \d+/)?.[0])
    expect(order()).toEqual(['Visit 1', 'Visit 2', 'Visit 3'])
    fireEvent.click(within(dlg).getByRole('button', { name: 'Oldest first' }))
    expect(within(dlg).getByRole('button', { name: 'Newest first' }).getAttribute('aria-pressed')).toBe('true')
    expect(order()).toEqual(['Visit 3', 'Visit 2', 'Visit 1'])
    fireEvent.click(within(dlg).getAllByRole('button', { name: /^Visit \d/ })[0])
    expect(document.activeElement).toBe(within(dlg).getByRole('heading', { name: /^Visit 1/ }))
  })

  it('two visits on the same day stack into two lanes', async () => {
    state.journey = journey().slice(0, 2).map((s, i) => ({ ...s, start: IST(20, 9 + i * 5), steps: s.steps.map((st) => ({ ...st, ts: IST(20, 9 + i * 5) })), goals: [] }))
    visit('/activity/visitors?site=demo&v=p9')
    render(<JourneySheet />)
    await flush()
    const marks = within(screen.getByRole('dialog')).getAllByRole('button', { name: /^Visit \d/ })
    expect(marks.map((m) => m.style.getPropertyValue('--lane'))).toEqual(['0', '1'])
  })

  it('share mode shows the pseudonym and no raw id', async () => {
    visit('/share/shr_abc/activity/visitors?v=rawperson123456')
    render(<JourneySheet />)
    await flush()
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByTestId('journey-label').textContent).toBe('Visitor K7QD')
    expect(dlg.textContent).not.toContain('rawp')
    expect(dlg.textContent).not.toContain('rawperson123456')
  })

  it('an unknown person gets a calm state', async () => {
    state.journey = []
    visit('/activity/visitors?site=demo&v=nobody')
    render(<JourneySheet />)
    await flush()
    expect(screen.getByText('No journey for this visitor')).toBeTruthy()
  })
})

describe('JourneySheet: AI agents and location accuracy (plan F-3, F-6)', () => {
  it('an agent session says "AI agent" and names the agent next to the visit title', async () => {
    state.journey = journey().map((x, i) => (i === 1 ? { ...x, agent: 'claude-agent' } : x))
    visit('/activity/visitors?site=demo&v=p9')
    render(<JourneySheet />)
    await flush()
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByRole('heading', { name: /^Visit 2.*AI agent.*Claude agent/ })).toBeTruthy()
    expect(within(dlg).getAllByText('AI agent')).toHaveLength(1)
  })

  it('a person’s sessions carry no agent tag', async () => {
    visit('/activity/visitors?site=demo&v=p9')
    render(<JourneySheet />)
    await flush()
    expect(within(screen.getByRole('dialog')).queryByText('AI agent')).toBeNull()
  })

  it('a city reads as a rough estimate; a country alone does not', async () => {
    visit('/activity/visitors?site=demo&v=p9')
    render(<JourneySheet />)
    await flush()
    expect(within(screen.getByRole('dialog')).getByText('(rough estimate)')).toBeTruthy()
    cleanup()
    invalidate()
    state.journey = journey().map((x) => ({ ...x, city: '' }))
    visit('/activity/visitors?site=demo&v=p9')
    render(<JourneySheet />)
    await flush()
    expect(within(screen.getByRole('dialog')).queryByText('(rough estimate)')).toBeNull()
  })
})

describe('EventSheet', () => {
  it('an occurrence opens v=person~session and removes evn=', async () => {
    visit('/activity/events?site=demo&evn=Signup')
    render(<EventSheet />)
    await flush()
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByText('property')).toBeTruthy()
    expect(within(within(dlg).getByRole('region', { name: 'Property plan' })).getByText('free')).toBeTruthy()
    fireEvent.click(within(dlg).getByRole('button', { name: /^Visitor 3 .*Open the journey$/ }))
    expect(current().sheet).toEqual({ kind: 'journey', person: 'p3', session: 's3' })
    expect(location.search).not.toContain('evn=')
    expect(decodeURIComponent(location.search)).toContain('v=p3~s3')
  })

  it('Filter dashboard adds the event filter', async () => {
    visit('/activity/events?site=demo&evn=Signup')
    render(<EventSheet />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /Filter dashboard/ }))
    expect(current().filters).toEqual([{ dim: 'event', value: 'Signup' }])
  })
})
