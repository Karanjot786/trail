import { beforeEach, describe, expect, it } from 'vitest'
import type { Site } from '../api/types'
import { allowedStep, checkDomain, checkId, idFor, isSkipped, onboardingRedirect, skip, unskip } from './onboarding'
import { parseUrl, serializeUrl } from '../state/url'

const site = (id: string, lastEventAt: number | null = 1): Site => ({
  id, domain: `${id}.example.com`, origins: [], created: 0, lastEventAt, events24h: 0, features: { revenue: false, crawlers: false, currency: 'USD' },
})
const at = (screen: string, s = '', extra: Partial<{ prefix: string; fixtures: boolean }> = {}) => ({ prefix: '', screen, site: s, fixtures: false, ...extra })
const never = () => false

describe('checkDomain', () => {
  it.each([
    ['example.com', 'example.com'],
    ['  https://Example.com/pricing?x=1#top ', 'example.com'],
    ['http://blog.example.co.uk:8080/', 'blog.example.co.uk'],
    ['www.example.com.', 'www.example.com'],
  ])('normalises %j to %s', (input, want) => {
    expect(checkDomain(input)).toEqual({ ok: true, domain: want, wildcard: false })
  })
  it('drops a leading wildcard: subdomains are always allowed', () => {
    expect(checkDomain('*.example.com')).toEqual({ ok: true, domain: 'example.com', wildcard: true })
    expect(checkDomain('https://*.shop.example.com/')).toMatchObject({ ok: true, domain: 'shop.example.com' })
  })
  it.each(['', '   ', 'localhost', 'example', 'exa mple.com', 'foo_bar.com', '-x.com', 'x-.com', '*.*.example.com', '10.0.0.1', 'https://'])(
    'refuses %j with a message',
    (input) => {
      const r = checkDomain(input)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/domain/i)
    },
  )
})

describe('site id', () => {
  it('is suggested from the domain', () => {
    expect(idFor('www.example.com')).toBe('example')
    expect(idFor('blog.example.co.uk')).toBe('blog-example')
    expect(idFor('my-app.vercel.app')).toBe('my-app')
  })
  it('follows the server rule', () => {
    expect(checkId('example')).toBeNull()
    expect(checkId('a'.repeat(40))).toBeNull()
    expect(checkId('')).toMatch(/ID/)
    expect(checkId('-x')).toMatch(/lowercase/)
    expect(checkId('Has Caps')).toMatch(/lowercase/)
    expect(checkId('a'.repeat(41))).toMatch(/40/)
  })
})

describe('onboardingRedirect', () => {
  it('sends an instance with no sites to step 1, from any screen', () => {
    expect(onboardingRedirect(at('overview'), [], never)).toEqual({ tab: 'site', site: '' })
    expect(onboardingRedirect(at('settings'), [], never)).toEqual({ tab: 'site', site: '' })
  })
  it('sends the Overview of a site with no events to step 2 (TRAIL_SITES-seeded instances)', () => {
    expect(onboardingRedirect(at('overview', 'mysite'), [site('mysite', null)], never)).toEqual({ tab: 'install', site: 'mysite' })
  })
  it('leaves sites with data, other screens, All websites and unknown ids alone', () => {
    expect(onboardingRedirect(at('overview', 'a'), [site('a')], never)).toBeNull()
    expect(onboardingRedirect(at('settings', 'a'), [site('a', null)], never)).toBeNull()
    expect(onboardingRedirect(at('overview', 'all'), [site('a', null)], never)).toBeNull()
    expect(onboardingRedirect(at('overview', ''), [site('a', null)], never)).toBeNull()
    expect(onboardingRedirect(at('overview', 'zzz'), [site('a', null)], never)).toBeNull()
  })
  it('never onboards the demo, a share link, recorded data, or while loading', () => {
    expect(onboardingRedirect(at('overview', 'a', { prefix: '/demo' }), [site('a', null)], never)).toBeNull()
    expect(onboardingRedirect(at('overview', '', { prefix: '/share/x' }), [], never)).toBeNull()
    expect(onboardingRedirect(at('overview', '', { fixtures: true }), [], never)).toBeNull()
    expect(onboardingRedirect(at('overview'), undefined, never)).toBeNull()
    expect(onboardingRedirect(at('welcome'), [], never)).toBeNull()
  })
  it('respects "I’ll do this later"', () => {
    expect(onboardingRedirect(at('overview', 'a'), [site('a', null)], (s) => s === 'a')).toBeNull()
    expect(onboardingRedirect(at('overview'), [], (s) => s === '*')).toBeNull()
    expect(onboardingRedirect(at('overview', 'b'), [site('a', null), site('b', null)], (s) => s === 'a')).toEqual({ tab: 'install', site: 'b' })
  })
})

describe('allowedStep', () => {
  it('needs a site for every step after the first, and data for Done', () => {
    expect(allowedStep('install', null)).toBe('site')
    expect(allowedStep('nonsense', site('a'))).toBe('site')
    expect(allowedStep('install', site('a', null))).toBe('install')
    expect(allowedStep('verify', site('a', null))).toBe('verify')
    expect(allowedStep('done', site('a', null))).toBe('verify')
    expect(allowedStep('done', site('a', 5))).toBe('done')
  })
})

describe('progress in the URL', () => {
  it('round-trips /welcome/{step}?site=', () => {
    for (const tab of ['site', 'install', 'verify', 'done']) {
      const { state, redirect } = parseUrl(`/welcome/${tab}`, '?site=mysite')
      expect(redirect).toBeNull()
      expect(state).toMatchObject({ screen: 'welcome', tab, site: 'mysite' })
      expect(serializeUrl(state)).toBe(`/welcome/${tab}?site=mysite`)
    }
    expect(parseUrl('/welcome', '').state.tab).toBe('site')
    expect(parseUrl('/welcome/bogus', '').redirect).toBe('/welcome/site')
  })
})

describe('skip memory', () => {
  beforeEach(() => localStorage.clear())
  it('remembers per site and forgets when a site is added through the flow', () => {
    expect(isSkipped('a')).toBe(false)
    skip('a')
    skip('a')
    skip('*')
    expect(isSkipped('a')).toBe(true)
    expect(JSON.parse(localStorage.getItem('trail.onboarding.skipped')!)).toEqual(['a', '*'])
    unskip('a')
    expect(isSkipped('a')).toBe(false)
    expect(isSkipped('*')).toBe(false)
  })
  it('survives junk in storage', () => {
    localStorage.setItem('trail.onboarding.skipped', '{nope')
    expect(isSkipped('a')).toBe(false)
    skip('a')
    expect(isSkipped('a')).toBe(true)
  })
})
