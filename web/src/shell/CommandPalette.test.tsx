import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { mockState, row, site } from './testkit'

vi.mock('../api/client', async (orig) => {
  const real = await orig<typeof import('../api/client')>()
  const { apiMock } = await import('./testkit')
  return { ...real, api: apiMock() }
})

import { App } from '../App'
import { current, startRouter } from './router'
import { invalidate } from '../api/useQuery'
import { resetGone } from './Banners'
import { resetUi } from './uiStore'
import { api } from '../api/client'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)))
const key = (k: string, o: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key: k, ...o })

beforeEach(() => {
  invalidate()
  resetGone()
  resetUi()
  mockState.sites = [site('demo'), site('docs')]
  mockState.views = []
  mockState.breakdown = { source: [row('', 169), row('Google', 163)], path: [row('/', 224)] }
})
afterEach(cleanup)

async function boot(url: string, sheet = false) {
  visit(url)
  render(<App />)
  await flush()
  if (sheet) await screen.findByRole('dialog', { name: 'Journey' })
  else await screen.findByRole('navigation', { name: 'Main' })
}

describe('CommandPalette', () => {
  it('lists "Came directly" for an empty source', async () => {
    await boot('/?site=demo')
    key('k', { metaKey: true })
    await flush()
    await screen.findByRole('dialog', { name: 'Command palette' })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'came' } })
    await flush()
    expect(screen.getByRole('option', { name: /Came directly/ })).toBeTruthy()
  })

  it('picking a filter adds f= and closes the palette', async () => {
    await boot('/?site=demo')
    key('f')
    await flush()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'google' } })
    await flush()
    fireEvent.click(screen.getByRole('option', { name: /Google/ }))
    await flush()
    expect(location.search).toContain('f=source%3AGoogle')
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
  })

  it('palette and ? sheet render with no transition when keyboard-opened', async () => {
    await boot('/?site=demo')
    key('k', { ctrlKey: true })
    await flush()
    expect((await screen.findByRole('dialog', { name: 'Command palette' })).hasAttribute('data-instant')).toBe(true)
    key('Escape')
    await flush()
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
    key('?')
    await flush()
    expect((await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).hasAttribute('data-instant')).toBe(true)
  })
})

describe('SavedViews', () => {
  it('S with an open sheet saves viewState without the sheet', async () => {
    await boot('/activity/visitors?site=demo&f=country:IN&v=p_1', true)
    key('s')
    await flush()
    await flush()
    expect(current().sheet).toBeNull()
    const form = await screen.findByRole('dialog', { name: 'Save view' })
    expect(form.textContent).toContain('Country is IN')
    fireEvent.click(screen.getByRole('button', { name: 'Pin to sidebar' }))
    await flush()
    expect(api.createView).toHaveBeenCalledWith({ name: 'IN', site: 'demo', state: 'site=demo&f=country%3AIN' })
  })

  it('with no filters, says the view saves only the range and site', async () => {
    await boot('/?site=demo')
    fireEvent.click(screen.getByRole('button', { name: 'Save the current view' }))
    await flush()
    expect((await screen.findByRole('dialog', { name: 'Save view' })).textContent).toContain('No filters are on, so this saves only the range and site')
  })

  it('a saved view restores its filters after a reload', async () => {
    mockState.views = [{ id: 1, name: 'India mobile', site: 'demo', state: 'site=demo&f=country%3AIN&f=device%3Amobile', created: 0 }]
    await boot('/?site=demo')
    const link = await screen.findByRole('link', { name: 'India mobile' })
    expect(link.getAttribute('aria-current')).toBeNull()
    fireEvent.click(link)
    await flush()
    expect(current().filters).toEqual([
      { dim: 'country', value: 'IN' },
      { dim: 'device', value: 'mobile' },
    ])
    // Reload: a fresh parse of the same URL keeps the view and marks it current.
    cleanup()
    invalidate()
    await boot(location.pathname + location.search)
    expect((await screen.findByRole('link', { name: 'India mobile' })).getAttribute('aria-current')).toBe('page')
    expect(current().filters).toHaveLength(2)
  })
})
