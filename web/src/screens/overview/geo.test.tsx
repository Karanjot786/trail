// Plan F-6: location accuracy labels, the source chip, the Visitors city hint and the Config advice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import type { Config, SiteStatus } from '../../api/types'
import { apiMock, mockState, row } from '../../shell/testkit'

const m = vi.hoisted(() => ({ status: null as unknown as SiteStatus, config: null as unknown as Config }))
vi.mock('../../api/client', async (orig) => {
  const real = await orig<typeof import('../../api/client')>()
  const { apiMock } = await import('../../shell/testkit')
  return {
    ...real,
    api: {
      ...real.api,
      ...apiMock(),
      siteStatus: vi.fn(async () => m.status),
      config: vi.fn(async () => m.config),
    },
  }
})

import { OverviewPanels, geoSourceLabel, locationTabs, CITY_HINT } from './panels'
import { panelTabs } from '../../data/columns'
import { invalidate } from '../../api/useQuery'
import { startRouter } from '../../shell/router'
import { CITY_DEF } from '../activity/Visitors'
import ConfigScreen from '../settings/Config'

const config = (source: Config['geo']['source']): Config => ({
  version: 'dev', tz: 'UTC', demo: false, geo: { source, build: '2026-11' }, ingestRps: 100, envSites: [], envTokens: 0, dbFile: 'trail.db',
})
function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 30)))

beforeEach(() => {
  invalidate()
  void apiMock
  mockState.breakdown = { country: [row('IN', 40)], region: [row('IN-MH', 30)], city: [row('Mumbai', 20)] }
  m.status = { lastEventAt: 1, events24h: 10, rejected24h: 0, geo: { source: 'vercel', share: 0.7 } }
  m.config = config('embedded-country')
})
afterEach(cleanup)

describe('Location accuracy labels', () => {
  it('countries keep no label; regions are approximate; cities are a rough estimate with a definition', () => {
    const tabs = locationTabs(panelTabs('location'))
    expect(tabs.map((t) => t.label)).toEqual(['Countries', 'Regions · approximate', 'Cities · rough estimate'])
    expect(tabs[2].definition).toMatch(/often the ISP’s hub city/)
    expect(tabs[0].definition).toBeUndefined()
  })

  it('the city hint has the GPS numbers', () => {
    expect(CITY_HINT).toContain('20–37% of Indian visitors within 25 km')
    expect(CITY_DEF).toContain(CITY_HINT)
  })

  it.each([
    ['vercel', null, 'Location: your edge (Vercel)'],
    ['cloudflare', null, 'Location: Cloudflare'],
    ['netlify', null, 'Location: Netlify'],
    ['db', 'embedded-country', 'Location: DB-IP Lite (country)'],
    ['db', 'custom', 'Location: your database'],
    [null, 'custom', 'Location: your database'],
    ['db', null, 'Location: your database'],
    [null, null, null],
  ] as const)('source %s, database %s → %s', (src, db, want) => {
    expect(geoSourceLabel(src, db)).toBe(want)
  })

  it('the Overview Location panel shows the labelled tabs and the source chip', async () => {
    visit('/?site=demo')
    render(<OverviewPanels ctx={{}} />)
    await flush()
    const loc = document.querySelector('[data-panel="location"]') as HTMLElement
    expect(within(loc).getByRole('tab', { name: 'Regions · approximate' })).toBeTruthy()
    expect(within(loc).getByRole('tab', { name: 'Cities · rough estimate' })).toBeTruthy()
    expect(within(loc).getByRole('tab', { name: 'Countries' })).toBeTruthy()
    const chip = screen.getByTestId('geo-source')
    expect(chip.textContent).toContain('Location: your edge (Vercel)')
    expect(within(chip).getByRole('button', { name: 'Cities · rough estimate' })).toBeTruthy()
    expect(within(chip).queryByRole('link', { name: 'IP geolocation by DB-IP' })).toBeNull()
  })

  it('the database answering with DB-IP Lite keeps the DB-IP credit', async () => {
    m.status = { lastEventAt: 1, events24h: 10, rejected24h: 0, geo: { source: 'db', share: 1 } }
    visit('/?site=demo')
    render(<OverviewPanels ctx={{}} />)
    await flush()
    const chip = screen.getByTestId('geo-source')
    expect(chip.textContent).toContain('Location: DB-IP Lite (country)')
    expect(within(chip).getByRole('link', { name: 'IP geolocation by DB-IP' }).getAttribute('href')).toBe('https://db-ip.com')
  })

  it('no events yet (geo null) and a custom database: your database', async () => {
    m.status = { lastEventAt: null, events24h: 0, rejected24h: 0, geo: null }
    m.config = config('custom')
    visit('/?site=demo')
    render(<OverviewPanels ctx={{}} />)
    await flush()
    expect(screen.getByTestId('geo-source').textContent).toContain('Location: your database')
  })

  it('Settings → Config recommends GeoLite2 City over DB-IP City, and says why', async () => {
    visit('/settings/config')
    render(<ConfigScreen />)
    await flush()
    const t = document.body.textContent ?? ''
    expect(t).toContain('GeoLite2 City with your own free MaxMind key (TRAIL_GEO_DB) rather than DB-IP City')
    expect(t).toContain('about 1.5× more visitors within 25 km in India')
  })
})
