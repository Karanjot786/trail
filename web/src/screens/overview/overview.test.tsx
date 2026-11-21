import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import type { Basis, Changes, Heatmap, Series, Site, SiteSummary, Stats, Window } from '../../api/types'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 10, 14)
const basis: Basis = { text: 'vs Nov 7 – Nov 13 (the previous 7 days)', short: 'prev. 7 days', why: '', dates: 'Nov 7 – Nov 13', custom: false, none: false }
const win: Window = { key: '7d', label: 'Last 7 days', from: T0, to: T0 + 7 * DAY - 1, prevFrom: T0 - 7 * DAY, prevTo: T0 - 1, bucket: 'day', tz: 'UTC', elapsed: false, lastBucket: 6, clamped: false, invalid: '', basis }
const totals = { visitors: 525, pageviews: 1450, sessions: 657, durationMs: 151000, bounce: 0.43, conversions: 50, convVisitors: 50, convRate: 0.1, baseVisitors: 525, revenueMinor: 120000, purchases: 12 }
const prevTotals = { ...totals, visitors: 400, sessions: 3, bounce: 0.4 }
const site = (id: string, revenue: boolean): Site => ({ id, domain: `${id}.trail.dev`, origins: [], created: 0, lastEventAt: 1, events24h: 1, features: { revenue, crawlers: false, currency: 'USD' } })

const m = vi.hoisted(() => ({
  sites: [] as Site[],
  stats: null as unknown as Stats,
  heatmap: null as unknown as Heatmap,
  changes: { items: [] } as Changes,
  summary: [] as SiteSummary[],
  breakdownRows: 12,
}))
const series = (metric: string): Series => ({
  window: win,
  metric: metric as Series['metric'],
  bucket: 'day',
  points: [3, 5, 8, 4, 9, 7, 6].map((v, i) => ({ t: T0 + i * DAY, v: metric === 'visitors' ? v * 10 : v })),
  prev: [2, 4, 6, 3, 5, 4, 1].map((v, i) => ({ t: T0 - 7 * DAY + i * DAY, v: metric === 'visitors' ? v * 10 + 1 : v })),
  extras: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ t: T0 + i * DAY, topSources: [{ key: 'Google', visitors: 10 }], conversions: i % 2, revenueMinor: 0 })),
})
const api = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn> | ((...a: unknown[]) => unknown)>)
vi.mock('../../api/client', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return { ...real, api }
})

import OverviewScreen from './index'
import { RowReportSheet } from '../../sheets/RowReportSheet'
import { FullReportSheet } from '../../sheets/FullReportSheet'
import { invalidate } from '../../api/useQuery'
import { describeItem } from './WhatChanged'
import { kpiName } from './KpiStrip'
import { metricDefs } from './metrics'

function setup() {
  m.sites = [site('demo', true), site('docs', false)]
  m.stats = { ...totals, window: win, prev: prevTotals, online: 3, botRequests: 10, conv: { goalId: 1, name: 'Signup' } }
  m.heatmap = {
    from: 0, to: 1, weeks: 4, cells: Array.from({ length: 7 }, () => Array.from({ length: 24 }, (_, h) => h % 4)), max: 3, total: 400, status: 'ok', threshold: 150,
    peak: { dow: 0, hour: 3, value: 3 }, clear: false, busiest: { label: 'Weekday nights', fromHour: 0, toHour: 4, dows: [0, 1, 2, 3, 4] },
  }
  m.changes = { items: [{ kind: 'day', day: '2026-11-18', cur: 41, prev: 22, added: 19, source: 'news.ycombinator.com', basis: 'vs the day before' }, { kind: 'rate', metric: 'bounce', cur: 0.45, prev: 0.4, n: 50, basis: 'vs the previous 7 days' }] }
  Object.assign(api, {
    sites: vi.fn(async () => m.sites),
    stats: vi.fn(async () => m.stats),
    series: vi.fn(async (_q: URLSearchParams, metric: string) => series(metric)),
    notes: vi.fn(async () => [{ id: 1, site: 'demo', ts: T0 + 2 * DAY + 100, label: 'Launch', kind: 'deploy' }]),
    changes: vi.fn(async () => m.changes),
    heatmap: vi.fn(async () => m.heatmap),
    sessions: vi.fn(async () => ({ rows: [{ sessionId: 's1', person: 'p1', label: 'user_986', start: Date.now() - 60_000, durationMs: 1000, pages: 4, entry: '/', exit: '/pricing', source: 'Google', country: 'IN', city: 'Pune', device: 'Desktop', browser: 'Chrome', os: 'macOS', goals: [1], revenueMinor: 0 }], total: 1 })),
    goals: vi.fn(async () => [{ id: 1, name: 'Signup', kind: 'event', match: 'Signup' }]),
    breakdown: vi.fn(async (_q: URLSearchParams, dim: string) => {
      const rows = Array.from({ length: m.breakdownRows }, (_, i) => ({ key: dim === 'path' || dim === 'entry' || dim === 'exit' ? `/p${i}` : `${dim}${i}`, visitors: 120 - i * 5, pageviews: 200, total: 0, views: 150, exits: 10, exitRate: 0.2, convRate: 0.05 }))
      return { rows, total: rows.length }
    }),
    visitors: vi.fn(async () => ({ rows: [], total: 0 })),
    sitesSummary: vi.fn(async () => m.summary),
    exportUrl: (p: string, q: URLSearchParams, f: string) => `/api${p}?${q}&format=${f}`,
    shareMeta: vi.fn(async () => null),
    views: vi.fn(async () => []),
  })
}

beforeEach(() => {
  invalidate()
  setup()
  history.replaceState(null, '', '/?site=demo&range=7d')
})
afterEach(cleanup)

const metrics = () => document.querySelector('[role="tablist"][aria-label="Metrics"]') as HTMLElement

describe('KPI strip', () => {
  it('names each tab with its value and the basis', async () => {
    const r = render(<OverviewScreen />)
    const tab = await r.findByRole('tab', { name: /^Visitors, 525/ })
    expect(tab.getAttribute('aria-label')).toContain('vs Nov 7 – Nov 13')
    expect(within(metrics()).getAllByRole('tab')).toHaveLength(7)
    expect(tab.textContent).toContain('vs 400')
  })

  it('says "too little data" when the earlier base is under 5', () => {
    const d = metricDefs(m.stats)
    expect(kpiName(d.bounce, m.stats, basis, true, 'USD')).toContain('too little data')
  })

  it('hides the revenue tile when the site has no revenue', async () => {
    history.replaceState(null, '', '/?site=docs&range=7d')
    const r = render(<OverviewScreen />)
    await r.findByRole('tab', { name: /^Visitors/ })
    await waitFor(() => expect(within(metrics()).getAllByRole('tab')).toHaveLength(6))
    expect(within(metrics()).queryByRole('tab', { name: /Net revenue/ })).toBeNull()
  })

  it('selecting a tile puts its metric in the URL', async () => {
    const r = render(<OverviewScreen />)
    fireEvent.click(await r.findByRole('tab', { name: /^Sessions/ }))
    expect(new URLSearchParams(location.search).get('metric')).toBe('sessions')
  })
})

describe('main chart', () => {
  it('names the figure, zooms into a picked day, and compares with the dashed series', async () => {
    const r = render(<OverviewScreen />)
    const fig = await r.findByRole('figure', { name: 'Visitors per day' })
    act(() => {
      fireEvent.keyDown(fig, { key: 'Home' })
    })
    act(() => {
      fireEvent.keyDown(fig, { key: 'ArrowRight' })
    })
    const card = r.getByTestId('chart-card')
    // bucket 1: 50 now, the dashed series has 41 at the same offset (not the day before, 30)
    expect(card.textContent).toContain('41')
    expect(card.textContent).toMatch(/dashed line/)
    expect(card.querySelectorAll('[data-key-dot]')).toHaveLength(1)
    expect(card.querySelectorAll('[data-delta]').length).toBeGreaterThanOrEqual(3)
    act(() => {
      fireEvent.keyDown(fig, { key: 'Enter' })
    })
    expect(new URLSearchParams(location.search).get('range')).toBe('d:2026-11-15')
  })

  it('names the chart and the dashed period in the readout and legend', async () => {
    const r = render(<OverviewScreen />)
    const readout = await r.findByTestId('chart-readout')
    expect(readout.textContent).toContain('Visitors per day · Nov 14 – Nov 20')
    expect(r.getByTestId('chart-legend').textContent).toContain('Nov 7 – Nov 13')
  })
})

describe('What changed', () => {
  it('a day item zooms in and a rate item switches the metric', async () => {
    const r = render(<OverviewScreen />)
    const wc = await r.findByRole('region', { name: 'What changed' })
    expect(wc.textContent).toContain('41 vs 22')
    fireEvent.click(within(wc).getByRole('button', { name: /Bounce rate/ }))
    expect(new URLSearchParams(location.search).get('metric')).toBe('bounce')
    fireEvent.click(within(wc).getByRole('button', { name: /Biggest jump/ }))
    expect(new URLSearchParams(location.search).get('range')).toBe('d:2026-11-18')
  })

  it('writes the day item with its basis', () => {
    const { name } = describeItem(m.changes.items[0])
    expect(name).toContain('+19 visitors (+86%)')
    expect(name).toContain('41 vs 22 the day before')
  })
})

describe('heatmap wrapper', () => {
  it('adds weekday and hour filters and names no busiest hour when none stands out', async () => {
    const r = render(<OverviewScreen />)
    const grid = await r.findByRole('grid', { name: 'Visitors by weekday and hour' })
    const region = grid.closest('section')!
    expect(region.textContent).not.toMatch(/busiest/i)
    expect(region.textContent).toContain('No single hour stands out')
    expect(region.querySelectorAll('.peak')).toHaveLength(0)
    const cell = grid.querySelector<HTMLElement>('[tabindex="0"]')!
    cell.focus()
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(new URLSearchParams(location.search).getAll('f')).toEqual(['dow:0', 'hour:3'])
  })

  it('shows the count so far when data is sparse', async () => {
    m.heatmap = { ...m.heatmap, status: 'sparse', total: 9 }
    const r = render(<OverviewScreen />)
    expect(await r.findByText('Not enough data yet')).toBeTruthy()
    expect(r.container.querySelector('.dotnum')!.textContent).toBe('9/150')
  })
})

describe('Overview', () => {
  it('renders all six panels, the heatmap and recent journeys', async () => {
    const r = render(<OverviewScreen />)
    for (const n of ['Pages', 'Sources', 'Location', 'Events', 'Devices', 'Goals']) expect(await r.findByRole('region', { name: n })).toBeTruthy()
    expect(await r.findByRole('grid', { name: 'Visitors by weekday and hour' })).toBeTruthy()
    expect(await r.findByTestId('journey-label')).toBeTruthy()
  })

  it('a row opens its report (dr=) and its Filter button adds f=', async () => {
    const r = render(<OverviewScreen />)
    const src = await r.findByRole('region', { name: 'Sources' })
    fireEvent.click(await within(src).findByRole('button', { name: 'source1' }))
    expect(new URLSearchParams(location.search).get('dr')).toBe('source|source1')
    fireEvent.click(within(src).getByRole('button', { name: 'Filter by source2' }))
    expect(new URLSearchParams(location.search).getAll('f')).toEqual(['source:source2'])
  })

  it('keeps the KPI strip when nothing matches the filters', async () => {
    m.stats = { ...m.stats, visitors: 0, pageviews: 0, sessions: 0 }
    history.replaceState(null, '', '/?site=demo&range=7d&f=country:GB')
    const r = render(<OverviewScreen />)
    expect(await r.findByText('No visits match these filters')).toBeTruthy()
    expect(metrics()).not.toBeNull()
    expect(metrics().textContent).not.toMatch(/NaN|Infinity|-100%/)
  })

  it('site=all renders one card per site', async () => {
    m.summary = [
      { id: 'demo', domain: 'demo.trail.dev', visitors: 525, prevVisitors: 400, online: 3, spark: [1, 2, 3] },
      { id: 'docs', domain: 'docs.trail.dev', visitors: 100, prevVisitors: null, online: 0, spark: [0, 1, null] },
    ]
    history.replaceState(null, '', '/?site=all')
    const r = render(<OverviewScreen />)
    await r.findByRole('button', { name: /Open demo.trail.dev: 525 visitors/ })
    expect(r.getAllByRole('button', { name: /^Open .*visitors$/ })).toHaveLength(2)
  })
})

describe('report sheets', () => {
  it('the rep= sheet lists every row (at least 10)', async () => {
    history.replaceState(null, '', '/?site=demo&range=7d&rep=sources:sources')
    const r = render(<FullReportSheet />)
    const dialog = await r.findByRole('dialog', { name: 'Sources' })
    await waitFor(() => expect(within(dialog).getAllByRole('row').length).toBeGreaterThanOrEqual(11))
    expect(dialog.textContent).toContain('/api/v1/breakdown?')
  })

  it('the dr= sheet shows the row numbers and filters the dashboard', async () => {
    history.replaceState(null, '', '/?site=demo&range=7d&dr=source|Google')
    const r = render(<RowReportSheet />)
    const dialog = await r.findByRole('dialog', { name: 'Source: Google' })
    await within(dialog).findByText('525')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Filter dashboard' }))
    const q = new URLSearchParams(location.search)
    expect(q.getAll('f')).toEqual(['source:Google'])
    expect(q.get('dr')).toBeNull()
  })
})
