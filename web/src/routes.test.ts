import { describe, expect, it } from 'vitest'
import { SCREENS } from './routes'
import { SCREEN_TABS } from './state/url'

describe('route registry', () => {
  it('lists the screens in IA order', () => {
    expect(SCREENS.map((s) => s.label)).toEqual(['Overview', 'Live', 'Acquisition', 'Activity', 'Conversions', 'Revenue', 'AI crawlers', 'Settings'])
  })
  it('loads a default component for every screen', async () => {
    for (const s of SCREENS) {
      const mod = await s.load()
      expect(typeof mod.default, s.id).toBe('function')
    }
  })
  it('matches the URL schema tabs and gates revenue', () => {
    for (const s of SCREENS) expect((s.tabs ?? []).map((t) => t.value), s.id).toEqual(SCREEN_TABS[s.id])
    expect(SCREENS.filter((s) => s.requires === 'revenue').map((s) => s.id)).toEqual(['revenue'])
  })
})
