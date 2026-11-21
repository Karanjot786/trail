import { describe, expect, it } from 'vitest'
import { apiQuery, parseUrl, serializeUrl, viewState } from './url'

describe('url state', () => {
  it('round-trips defaults to a bare path', () => expect(serializeUrl(parseUrl('/', '').state)).toBe('/'))
  it('parses screen, tab, filters, panels and sheet', () => {
    const { state } = parseUrl('/activity/sessions', '?site=demo&range=7d&f=source:Google&f=country:IN&p.pages=exit&v=abc~s1')
    expect(state).toMatchObject({ screen: 'activity', tab: 'sessions', range: '7d', filters: [{ dim: 'source', value: 'Google' }, { dim: 'country', value: 'IN' }], panels: { pages: 'exit' }, sheet: { kind: 'journey', person: 'abc', session: 's1' } })
  })
  it('redirects legacy links', () => {
    expect(parseUrl('/', '?view=visitors').redirect).toBe('/activity/visitors')
    expect(parseUrl('/', '?person=u1&site=demo').redirect).toBe('/activity/visitors?site=demo&v=u1')
    expect(parseUrl('/people/visits', '').redirect).toBe('/activity/sessions')
    expect(parseUrl('/', '?view=settings').redirect).toBe('/settings/sites')
    expect(parseUrl('/', '?range=24h').redirect).toBe('/?range=today')
    expect(parseUrl('/', '?range=3mo').state.range).toBe('90d')
  })
  it('keeps an unknown range visible', () => expect(parseUrl('/', '?range=bogus').invalidRange).toBe('bogus'))
  it('viewState drops the sheet and prefix', () => expect(viewState(parseUrl('/share/x/revenue', '?site=demo&evn=Signup&f=source:X').state)).toBe('site=demo&f=source%3AX'))
  it('hr=1 only counts under /share/', () => {
    expect(parseUrl('/revenue', '?hr=1').state.hideRevenue).toBe(false)
    expect(parseUrl('/share/tok/revenue', '?hr=1').state.hideRevenue).toBe(true)
  })
  it('has no redirect for a canonical url', () => expect(parseUrl('/', '').redirect).toBeNull())

  it('parses prefixes, ids and every sheet kind', () => {
    expect(parseUrl('/demo/conversions/goals/9', '').state).toMatchObject({ prefix: '/demo', screen: 'conversions', tab: 'goals', id: 9 })
    expect(parseUrl('/share/abc/live', '').state).toMatchObject({ prefix: '/share/abc', screen: 'live' })
    expect(parseUrl('/', '?dr=path|/pricing').state.sheet).toEqual({ kind: 'row', dim: 'path', key: '/pricing' })
    expect(parseUrl('/', '?rep=pages:exit').state.sheet).toEqual({ kind: 'report', panel: 'pages', tab: 'exit' })
    expect(parseUrl('/activity/events', '?evn=Sign%20up').state.sheet).toEqual({ kind: 'event', name: 'Sign up' })
    expect(parseUrl('/conversions/funnels/3', '?fd=3:1').state.sheet).toEqual({ kind: 'dropoff', funnel: 3, step: 1 })
  })

  it('defaults the tab and keeps values with colons', () => {
    const { state } = parseUrl('/acquisition', '?f=referrer:https://x.dev/a:b')
    expect(state.tab).toBe('sources')
    expect(state.filters).toEqual([{ dim: 'referrer', value: 'https://x.dev/a:b' }])
  })

  it('drops unknown dims, duplicate dims and unknown panels', () => {
    const { state } = parseUrl('/', '?f=nope:1&f=source:A&f=source:B&p.nope=x&p.pages=nope')
    expect(state.filters).toEqual([{ dim: 'source', value: 'A' }])
    expect(state.panels).toEqual({})
  })

  it('sends unknown paths to the overview', () => {
    const r = parseUrl('/nowhere', '?site=demo')
    expect(r.state.screen).toBe('overview')
    expect(r.redirect).toBe('/?site=demo')
  })

  it('serializes in a stable order with defaults omitted', () => {
    const url = '/demo/activity/sessions?site=demo&range=7d&cmp=none&env=all&metric=sessions&f=source%3AGoogle&p.pages=exit&v=abc%7Es1'
    const { state } = parseUrl('/demo/activity/sessions', '?v=abc~s1&p.pages=exit&f=source:Google&metric=sessions&env=all&cmp=none&range=7d&site=demo')
    expect(serializeUrl(state)).toBe(url)
    expect(serializeUrl(parseUrl('/demo/activity/sessions', url.slice(url.indexOf('?'))).state)).toBe(url)
  })

  it('round-trips person ids that contain ~', () => {
    const a = parseUrl('/activity/visitors', '?person=u~1').redirect!
    expect(parseUrl(a.split('?')[0], a.slice(a.indexOf('?'))).state.sheet).toEqual({ kind: 'journey', person: 'u~1' })
    const b = serializeUrl({ ...parseUrl('/', '').state, sheet: { kind: 'journey', person: 'u~1', session: 's9' } })
    expect(parseUrl(b.split('?')[0], b.slice(b.indexOf('?'))).state.sheet).toEqual({ kind: 'journey', person: 'u~1', session: 's9' })
  })

  it('builds the api query', () => {
    const { state } = parseUrl('/', '?site=demo&f=country:IN')
    expect(apiQuery(state, 'Asia/Kolkata').toString()).toBe('site=demo&range=30d&cmp=prev&env=production&tz=Asia%2FKolkata&f=country%3AIN')
  })

  it('accepts day and custom ranges and custom comparisons', () => {
    const { state, invalidRange } = parseUrl('/', '?range=c:2026-11-01~2026-11-05&cmp=c:2026-07-01')
    expect(invalidRange).toBeNull()
    expect(state).toMatchObject({ range: 'c:2026-11-01~2026-11-05', cmp: 'c:2026-07-01' })
    expect(parseUrl('/', '?range=d:2026-11-12').state.range).toBe('d:2026-11-12')
  })
})

describe('screen sub-views (SUBTABS)', () => {
  it('round-trips goal tabs, the Acquisition group-by and the revenue dimension, default omitted', () => {
    const { state } = parseUrl('/conversions/goals/3', '?site=demo&p.goal=sources&p.acq=channel&p.rev=country')
    expect(state.panels).toEqual({ goal: 'sources', acq: 'channel', rev: 'country' })
    expect(serializeUrl(state)).toBe('/conversions/goals/3?site=demo&p.acq=channel&p.goal=sources&p.rev=country')
    expect(viewState(state)).toContain('p.goal=sources')
    state.panels = { goal: 'overview', rev: 'source' }
    expect(serializeUrl(state)).toBe('/conversions/goals/3?site=demo')
  })
  it('drops unknown values and never opens a report sheet for them', () => {
    const { state } = parseUrl('/', '?p.goal=nope&rep=goal:sources')
    expect(state.panels).toEqual({})
    expect(state.sheet).toBeNull()
  })
})
