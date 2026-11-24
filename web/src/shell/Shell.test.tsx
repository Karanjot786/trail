import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { apiMock, mockState, site, stats as baseStats } from './testkit'

vi.mock('../api/client', async (orig) => {
  const real = await orig<typeof import('../api/client')>()
  const { apiMock: mk } = await import('./testkit')
  return { ...real, api: mk() }
})

import { App } from '../App'
import { startRouter, current } from './router'
import { invalidate, STALE_AFTER_MS } from '../api/useQuery'
import { resetGone } from './Banners'
import { resetUi } from './uiStore'
import { Gone, api } from '../api/client'

void apiMock

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)))

beforeEach(() => {
  invalidate()
  resetGone()
  resetUi()
  mockState.sites = [site('demo', false), site('docs', true)]
  mockState.views = []
  mockState.shareMeta = null
})
afterEach(cleanup)

describe('Shell', () => {
  it('lists the nav in IA order and hides Revenue for a site without revenue', async () => {
    visit('/?site=demo')
    render(<App />)
    await flush()
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const labels = within(nav).getAllByRole('link').map((a) => a.textContent?.replace(/\d+ online$/, '').trim())
    expect(labels).toEqual(['Overview', 'Live', 'Acquisition', 'Activity', 'Conversions', 'AI visibility'])
    cleanup()
    invalidate()
    visit('/?site=docs')
    render(<App />)
    await flush()
    const nav2 = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav2).getByRole('link', { name: /Revenue/ })).toBeTruthy()
  })

  it('names the first site in the URL when none is given', async () => {
    visit('/')
    render(<App />)
    await flush()
    expect(current().site).toBe('demo')
  })

  it('share mode hides Share, the switcher menu, Settings and Views; chips have no remove', async () => {
    mockState.shareMeta = { site: site('demo'), state: 'f=country:IN', hideRevenue: false, expires: null }
    visit('/share/shr_abc/?site=demo&f=country:IN')
    render(<App />)
    await flush()
    await screen.findByRole('navigation', { name: 'Main' })
    expect(screen.queryByRole('button', { name: 'Share link' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Views' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Switch site/ })).toBeNull()
    const bar = screen.getByRole('region', { name: 'Filters' })
    expect(within(bar).queryByRole('button', { name: /Remove filter/ })).toBeNull()
    expect(within(bar).queryByRole('button', { name: 'Clear all' })).toBeNull()
    expect(screen.getAllByRole('status').some((el) => el.textContent?.includes('Read-only link'))).toBe(true)
  })

  it('Gone from the API renders the expired message', async () => {
    mockState.shareMeta = new Gone()
    visit('/share/shr_old/')
    render(<App />)
    await flush()
    await flush()
    expect(screen.getAllByText(/This link has expired or was revoked/).length).toBeGreaterThan(0)
  })

  it('Esc on an open sheet closes it and keeps the filters', async () => {
    visit('/activity/visitors?site=demo&f=country:IN&v=p_1')
    render(<App />)
    await flush()
    await screen.findByRole('dialog', { name: 'Journey' })
    fireEvent.keyDown(window, { key: 'Escape' })
    await flush()
    expect(current().sheet).toBeNull()
    expect(current().filters).toEqual([{ dim: 'country', value: 'IN' }])
  })

  it('removing a chip focuses the next chip', async () => {
    visit('/?site=demo&f=country:IN&f=device:mobile')
    render(<App />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter Country is IN' }))
    await flush()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove filter Device is mobile')
  })

  it('shows the freshness line with the basis', async () => {
    visit('/?site=demo')
    render(<App />)
    await flush()
    const f = await screen.findByTestId('freshness')
    expect(f.textContent).toContain('India time')
    expect(f.textContent).toContain('8,006 bot requests left out')
    expect(f.textContent).toContain('Changes are vs Sep 22 – Oct 21')
  })

  it('formats the freshness zone from the server, not the browser, and sends no tz', async () => {
    visit('/?site=demo')
    render(<App />)
    await flush()
    const f = await screen.findByTestId('freshness')
    expect(f.textContent).toContain('India time')
    const calls = vi.mocked(api.stats).mock.calls as unknown[][]
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect((c[0] as URLSearchParams).has('tz')).toBe(false)
  })

  it('a share link opens on its saved range and filters', async () => {
    mockState.shareMeta = { site: site('demo'), state: 'range=7d&f=country:IN', hideRevenue: false, expires: null }
    visit('/share/shr_abc/')
    render(<App />)
    await flush()
    await screen.findByRole('navigation', { name: 'Main' })
    await flush()
    expect(location.search).toContain('range=7d')
    expect(location.search).toContain('f=country%3AIN')
    const bar = screen.getByRole('region', { name: 'Filters' })
    expect(bar.querySelector('[data-fixed]')).toBeTruthy()
    expect(screen.getByLabelText(/Date range: Last 7 days/)).toBeTruthy()
  })

  it('re-pins range, env, actor and filters a viewer edits', async () => {
    mockState.shareMeta = { site: site('demo'), state: 'range=7d', hideRevenue: false, expires: null }
    visit('/share/shr_abc/?range=12mo&env=all&actor=all&f=device:mobile')
    render(<App />)
    await flush()
    await screen.findByRole('navigation', { name: 'Main' })
    await flush()
    expect(location.search).toBe('?site=demo&range=7d')
  })

  it('share mode shows no range or compare menu, only the label', async () => {
    mockState.shareMeta = { site: site('demo'), state: 'range=7d', hideRevenue: false, expires: null }
    visit('/share/shr_abc/')
    render(<App />)
    await flush()
    await screen.findByRole('navigation', { name: 'Main' })
    await flush()
    expect(screen.queryByRole('button', { name: /date range/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /compare/i })).toBeNull()
    expect(screen.getByLabelText(/Date range: /)).toBeTruthy()
  })

  it('Settings shows no range note and fetches no stats', async () => {
    vi.mocked(api.stats).mockClear()
    vi.mocked(api.stats).mockImplementation(async () => ({ ...baseStats(), window: { ...baseStats().window, clamped: true } }))
    visit('/settings/sites?site=demo')
    render(<App />)
    await flush()
    await screen.findByRole('navigation', { name: 'Main' })
    expect(document.querySelector('[role=note]')).toBeNull()
    expect(api.stats).not.toHaveBeenCalled()
  })

  it('the stale banner appears without a rerender after 10 minutes', async () => {
    vi.mocked(api.stats).mockReset()
    vi.mocked(api.stats).mockImplementationOnce(async () => baseStats())
    vi.mocked(api.stats).mockImplementation(() => new Promise(() => {}))
    // A hidden tab pauses the stats poll, so only the banner's own tick can bring the notice in.
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    try {
      visit('/?site=demo')
      render(<App />)
      await flush()
      expect(screen.queryByText(/more than 10 minutes old/)).toBeNull()
      act(() => {
        vi.advanceTimersByTime(STALE_AFTER_MS + 31_000)
      })
      expect(screen.getByText(/more than 10 minutes old/)).toBeTruthy()
    } finally {
      hidden.mockRestore()
      vi.useRealTimers()
    }
  })
})
