import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Crawlers } from '../../api/types'
import { site, stats, win } from '../../shell/testkit'

const m = vi.hoisted(() => ({ cr: null as unknown as Crawlers }))
const full = (): Crawlers => ({
  configured: true,
  window: win,
  total: 8006,
  prevTotal: 7000,
  categories: [
    { key: 'training', requests: 5000, prev: 4000 },
    { key: 'indexing', requests: 2000, prev: 2000 },
    { key: 'fetch', requests: 1000, prev: 900 },
    { key: 'general', requests: 6, prev: 100 },
  ],
  providers: [{ provider: 'OpenAI', crawlers: [{ name: 'GPTBot', category: 'training', requests: 5000, prev: 4000 }] }],
  series: [{ t: 0, training: 10, indexing: 5, fetch: 2, general: 0 }],
  pages: [
    { path: '/docs', provider: 'OpenAI', crawler: 'GPTBot', category: 'training', requests: 400, lastSeen: Date.now(), share: 0.05 },
    { path: '/pricing', provider: 'Anthropic', crawler: 'ClaudeBot', category: 'training', requests: 100, lastSeen: Date.now(), share: 0.0125 },
  ],
})

vi.mock('../../api/client', async (orig) => {
  const real = await orig<typeof import('../../api/client')>()
  return {
    ...real,
    api: {
      ...real.api,
      sites: vi.fn(async () => [site('demo')]),
      stats: vi.fn(async () => ({ ...stats(), botRequests: m.cr.configured ? m.cr.total : null })),
      crawlers: vi.fn(async () => m.cr),
    },
  }
})

import CrawlersScreen from './index'
import { api } from '../../api/client'
import { startRouter } from '../../shell/router'
import { invalidate } from '../../api/useQuery'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
beforeEach(() => {
  invalidate()
  m.cr = full()
})
afterEach(cleanup)

describe('AI crawlers', () => {
  it('not configured: the setup names this site and this host, with a crawl-token link', async () => {
    m.cr = { ...full(), configured: false, total: 0, pages: [], providers: [], categories: [], series: [] }
    visit('/crawlers?site=demo')
    render(<CrawlersScreen />)
    expect(await screen.findByText('Not set up yet')).toBeTruthy()
    const code = () => document.querySelector('pre code')!.textContent ?? ''
    expect(code()).toContain(`trail crawlers import --site demo --url ${location.origin} --token TOKEN -`)
    fireEvent.click(screen.getByRole('tab', { name: 'Caddy' }))
    expect(code()).toContain('--format caddy')
    fireEvent.click(screen.getByRole('tab', { name: 'Any proxy' }))
    expect(code()).toContain(`${location.origin}/api/v1/crawls`)
    expect(screen.getByRole('link', { name: 'Create a crawl token' }).getAttribute('href')).toMatch(/\/settings\/tokens/)
  })

  it('the top page row has a full bar, and the total matches the freshness line’s bot count', async () => {
    visit('/crawlers?site=demo')
    render(<CrawlersScreen />)
    const table = await screen.findByRole('table')
    await within(table).findByText('/docs')
    const bars = table.querySelectorAll<HTMLElement>('[data-bar]')
    expect(bars[0].style.transform).toBe('scaleX(1)')
    expect(bars[1].style.transform).toBe('scaleX(0.25)')
    const st = await api.stats(new URLSearchParams())
    expect(screen.getAllByText(st.botRequests!.toLocaleString('en-US')).length).toBeGreaterThan(0)
    expect(screen.getByText(/By user agent; not verified by IP/)).toBeTruthy()
  })

  it('a single day widens to the last 7 days, and says so', async () => {
    visit('/crawlers?site=demo&range=today')
    render(<CrawlersScreen />)
    expect(await screen.findByText(/Showing the last 7 days: crawler data is daily/)).toBeTruthy()
  })
})
