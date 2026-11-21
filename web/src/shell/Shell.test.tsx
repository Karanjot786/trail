import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { apiMock, mockState, site } from './testkit'

vi.mock('../api/client', async (orig) => {
  const real = await orig<typeof import('../api/client')>()
  const { apiMock: mk } = await import('./testkit')
  return { ...real, api: mk() }
})

import { App } from '../App'
import { startRouter, current } from './router'
import { invalidate } from '../api/useQuery'
import { resetGone } from './Banners'
import { resetUi } from './uiStore'
import { Gone } from '../api/client'

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
    expect(labels).toEqual(['Overview', 'Live', 'Acquisition', 'Activity', 'Conversions', 'AI crawlers'])
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
    mockState.shareMeta = { site: site('demo'), state: '', hideRevenue: false, expires: null }
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
    expect(f.textContent).toContain('Kolkata time')
    expect(f.textContent).toContain('8,006 bot requests left out')
    expect(f.textContent).toContain('Changes are vs Sep 22 – Oct 21')
  })
})
