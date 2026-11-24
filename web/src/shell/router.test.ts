import { beforeEach, describe, expect, it, vi } from 'vitest'
import { current, go, linkTo, navigate, startRouter } from './router'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}

const settle = () => new Promise((r) => setTimeout(r, 30))

describe('router', () => {
  beforeEach(() => visit('/'))

  it('navigate({filters}) pushes one entry and back() restores the filters', async () => {
    visit('/?site=demo&f=country:IN')
    const before = history.length
    navigate({ filters: [{ dim: 'country', value: 'IN' }, { dim: 'device', value: 'mobile' }] })
    expect(history.length).toBe(before + 1)
    expect(current().filters).toHaveLength(2)
    history.back()
    await settle()
    expect(current().filters).toEqual([{ dim: 'country', value: 'IN' }])
  })

  it('drops a custom cmp on a range-length change and keeps it on the same length', () => {
    visit('/?site=demo&range=7d&cmp=c:2026-07-01')
    navigate({ range: '30d' })
    expect(current().cmp).toBe('prev')
    visit('/?site=demo&range=d:2026-11-12&cmp=c:2026-07-01')
    navigate({ range: 'yesterday' })
    expect(current().cmp).toBe('c:2026-07-01')
  })

  it('current() does not touch history', () => {
    history.pushState(null, '', '/people?x=1')
    const spy = vi.spyOn(history, 'replaceState')
    try {
      current()
      expect(spy).not.toHaveBeenCalled()
      expect(location.pathname).toBe('/people')
    } finally {
      spy.mockRestore()
    }
  })

  it('popstate onto a legacy URL still redirects', () => {
    visit('/')
    history.pushState(null, '', '/crawlers')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(location.pathname).toBe('/ai/crawlers')
    expect(current().screen).toBe('crawlers')
  })

  it('go() to a legacy URL lands canonical', () => {
    go('/crawlers')
    expect(location.pathname).toBe('/ai/crawlers')
  })

  it('replaces ?view=visitors with /activity/visitors', () => {
    const before = history.length
    visit('/?view=visitors')
    expect(location.pathname).toBe('/activity/visitors')
    expect(location.search).toBe('')
    expect(history.length).toBe(before)
  })

  it('keeps the /share/{token} prefix across navigations', () => {
    visit('/share/abc/?site=demo')
    navigate({ screen: 'activity' })
    expect(location.pathname).toBe('/share/abc/activity/visitors')
    expect(linkTo({ screen: 'live' })).toMatch(/^\/share\/abc\/live/)
  })

  it('a screen change closes the sheet and resets the tab', () => {
    visit('/activity/sessions?site=demo&v=p1')
    navigate({ screen: 'overview' })
    expect(current().sheet).toBeNull()
    expect(location.pathname).toBe('/')
  })
})
