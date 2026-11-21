// Test helpers for the shell: a mocked API and a URL reset. Used by *.test.tsx only.
import { vi } from 'vitest'
import type { Basis, Row, SavedView, Site, Stats, Window } from '../api/types'

export const basis: Basis = { text: 'vs Sep 22 – Oct 21 (the previous 30 days)', short: 'prev. 30 days', why: '', dates: 'Sep 22 – Oct 21', custom: false, none: false }
export const win: Window = {
  key: '30d', label: 'Last 30 days', from: 0, to: 1, prevFrom: null, prevTo: null, bucket: 'day', tz: 'Asia/Kolkata',
  elapsed: false, lastBucket: 29, clamped: false, invalid: '', basis,
}
export function site(id: string, revenue = false): Site {
  return { id, domain: `${id}.trail.dev`, origins: [], created: 0, lastEventAt: 1, events24h: 10, features: { revenue, crawlers: false, currency: 'USD' } }
}
export function stats(): Stats {
  return {
    visitors: 525, pageviews: 1450, sessions: 657, durationMs: 151000, bounce: 0.43, conversions: 50, convVisitors: 50, convRate: 0.1,
    baseVisitors: 525, revenueMinor: 0, purchases: 0, eventPeople: 129, window: win, prev: null, online: 6, botRequests: 8006, conv: null,
  }
}
export function row(key: string, visitors: number): Row {
  return { key, visitors, pageviews: visitors, total: visitors }
}
export const mockState = {
  sites: [site('demo', false), site('docs', true)] as Site[],
  views: [] as SavedView[],
  breakdown: {} as Record<string, Row[]>,
  shareMeta: null as null | { site: Site; state: string; hideRevenue: boolean; expires: number | null } | Error,
}

export function apiMock() {
  return {
    sites: vi.fn(async () => mockState.sites),
    stats: vi.fn(async () => stats()),
    views: vi.fn(async () => mockState.views),
    createView: vi.fn(async (v: { name: string; site: string | null; state: string }) => {
      const sv = { id: mockState.views.length + 1, created: 0, ...v }
      mockState.views = [...mockState.views, sv]
      return sv
    }),
    deleteView: vi.fn(async () => undefined),
    breakdown: vi.fn(async (_q: URLSearchParams, dim: string) => {
      const rows = mockState.breakdown[dim] ?? []
      return { rows, total: rows.length }
    }),
    visitors: vi.fn(async () => ({ rows: [], total: 0 })),
    shareMeta: vi.fn(async () => {
      if (mockState.shareMeta instanceof Error) throw mockState.shareMeta
      return mockState.shareMeta
    }),
  }
}
