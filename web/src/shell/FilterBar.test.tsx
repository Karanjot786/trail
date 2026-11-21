// Plan F-5: the "Count AI agents as visitors" toggle (a scope, not a filter) and the Overview KPI note.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const m = vi.hoisted(() => ({ agentSessions: 7 }))
vi.mock('../api/client', async (orig) => {
  const real = await orig<typeof import('../api/client')>()
  const { apiMock, stats } = await import('./testkit')
  return { ...real, api: { ...real.api, ...apiMock(), stats: vi.fn(async () => ({ ...stats(), agentSessions: m.agentSessions })) } }
})

import { FilterBar, clearFilters } from './FilterBar'
import { AgentNote } from '../screens/overview/KpiStrip'
import { current, startRouter } from './router'
import { invalidate } from '../api/useQuery'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 30)))
const toggle = () => screen.getByRole('button', { name: 'Count AI agents as visitors' })

beforeEach(() => {
  invalidate()
  m.agentSessions = 7
})
afterEach(cleanup)

describe('Count AI agents as visitors', () => {
  it('flips actor in the URL, and Back undoes it', async () => {
    visit('/?site=demo')
    render(<FilterBar />)
    await flush()
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle())
    expect(current().actor).toBe('all')
    expect(location.search).toContain('actor=all')
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
    await act(async () => {
      history.back()
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(current().actor).toBe('human')
    expect(location.search).not.toContain('actor=')
  })

  it('Clear all keeps actor=all', async () => {
    visit('/?site=demo&actor=all&f=country:IN')
    render(<FilterBar />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(current().filters).toEqual([])
    expect(current().actor).toBe('all')
    act(() => clearFilters())
    expect(current().actor).toBe('all')
  })

  it('hidden when the site has no agent sessions and the toggle is off; shown while on', async () => {
    m.agentSessions = 0
    visit('/?site=demo')
    const { container } = render(<FilterBar />)
    await flush()
    expect(container.textContent).toBe('')
    cleanup()
    visit('/?site=demo&actor=all')
    render(<FilterBar />)
    await flush()
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
  })

  it('not on Live, Settings or a share link', async () => {
    for (const url of ['/live?site=demo', '/settings/config?site=demo', '/share/shr_x/?site=demo']) {
      visit(url)
      render(<FilterBar />)
      await flush()
      expect(screen.queryByRole('button', { name: 'Count AI agents as visitors' })).toBeNull()
      cleanup()
    }
  })
})

describe('KPI note', () => {
  it('people only: "{n} AI agent sessions left out" with a link that sets actor=all', () => {
    visit('/?site=demo')
    render(<AgentNote n={7} />)
    expect(screen.getByText('7 AI agent sessions left out')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Count them as visitors' }))
    expect(current().actor).toBe('all')
  })

  it('actor=all: "Includes {n} AI agent sessions" with a link back', () => {
    visit('/?site=demo&actor=all')
    render(<AgentNote n={1} />)
    expect(screen.getByText('Includes 1 AI agent session')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Leave them out' }))
    expect(current().actor).toBe('human')
  })

  it('nothing when there are no agent sessions', () => {
    visit('/?site=demo')
    const { container } = render(<AgentNote n={0} />)
    expect(container.textContent).toBe('')
  })
})
