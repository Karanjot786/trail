import { describe, expect, it } from 'vitest'
import type { CheckItem, InstallCheck } from '../api/types'
import { FRAMEWORKS, REASON, installStatus, normalizeDomain, parseOrigins, snippet, suggestId, testVisitArrived } from './install'

const HOST = 'https://stats.example.com'

describe('snippets', () => {
  it('covers the eight frameworks in order', () => {
    expect(FRAMEWORKS.map((f) => f.label)).toEqual(['HTML', 'Next.js', 'React / Vite', 'Astro', 'Vue / Nuxt', 'SvelteKit', 'WordPress', 'Hugo / Jekyll'])
  })
  it('fills in the real site id and host for every framework', () => {
    for (const f of FRAMEWORKS) {
      const s = snippet(f.key, 'blog', HOST)
      expect(s.code, f.key).toMatch(/blog/)
      expect(s.code, f.key).toContain(HOST)
      expect(s.where.length, f.key).toBeGreaterThan(10)
    }
  })
  it('serves the tracker from /_t/ on the Trail host', () => {
    expect(snippet('html', 'blog', HOST).code).toBe(`<script defer src="${HOST}/_t/t.js" data-site="blog" data-api="${HOST}/_t/e"></script>`)
  })
  it('uses the npm package for Next.js and React', () => {
    expect(snippet('next', 'blog', HOST).code).toContain("from 'trail-analytics/next'")
    expect(snippet('react', 'blog', HOST).code).toContain("from 'trail-analytics/react'")
  })
  it('drops a trailing slash from the host', () => {
    expect(snippet('html', 'x', 'http://localhost:8080/').code).toContain('"http://localhost:8080/_t/t.js"')
  })
})

const item = (id: CheckItem['id'], status: CheckItem['status'], code: CheckItem['code'] = 'ok', label: string = id): CheckItem => ({ id, label, status, code, detail: '', fix: '' })
const chk = (state: InstallCheck['state'], checks: CheckItem[], lastEventAt: number | null = null): InstallCheck => ({ state, checkedAt: 1, lastEventAt, checks })

describe('installStatus', () => {
  it('reads waiting, receiving and blocked from the one check response', () => {
    expect(installStatus(chk('waiting', [])).title).toBe('Waiting for first event')
    expect(installStatus(chk('receiving', [], 5)).title).toBe('Receiving data')
    const b = installStatus(chk('blocked', [item('page', 'pass'), item('csp', 'fail', 'csp_blocked', 'Content Security Policy allows Trail')]))
    expect(b.title).toBe('Blocked: your Content Security Policy blocks Trail')
    expect(b.code).toBe('csp_blocked')
    expect(b.tone).toBe('bad')
  })
  it('receiving with warnings is a warn tone, never Blocked', () => {
    const one = installStatus(chk('receiving', [item('page', 'pass'), item('origin', 'warn', 'origin_not_allowed')], 5))
    expect(one).toEqual({ tone: 'warn', title: 'Receiving data, with a warning: this origin is not allowed', code: 'origin_not_allowed' })
    const two = installStatus(chk('receiving', [item('origin', 'warn', 'origin_not_allowed'), item('robots', 'warn', 'robots_blocks_ai')], 5))
    expect(two.title).toBe('Receiving data, with 2 warnings')
    expect(two.code).toBe('origin_not_allowed')
    expect(installStatus(chk('receiving', [item('page', 'pass')], 5)).tone).toBe('ok')
  })
  it('waiting with warnings keeps the waiting line and no code', () => {
    expect(installStatus(chk('waiting', [item('script', 'warn', 'script_missing')]))).toEqual({ tone: 'wait', title: 'Waiting for first event', code: null })
  })
  it('has copy for every reason code', () => {
    for (const c of ['api_missing', 'bot_protection', 'robots_blocks_ai', 'proxy_unsigned', 'proxy_bad_signature'] as const) expect(REASON[c].length).toBeGreaterThan(5)
    expect(REASON.script_missing).toBe('no Trail script in the server HTML')
  })
  it('has no state before the first check arrives', () => {
    expect(installStatus(undefined).title).toBe('Checking the install')
  })
})

describe('testVisitArrived', () => {
  it('is true only when lastEventAt moves past the value before the visit', () => {
    expect(testVisitArrived(null, chk('waiting', []))).toBe(false)
    expect(testVisitArrived(null, chk('receiving', [], 10))).toBe(true)
    expect(testVisitArrived(10, chk('receiving', [], 10))).toBe(false)
    expect(testVisitArrived(10, chk('receiving', [], 11))).toBe(true)
  })
})

describe('domain helpers', () => {
  it('normalizes a pasted URL to a bare host', () => {
    expect(normalizeDomain(' https://WWW.Example.com/pricing?x=1 ')).toBe('www.example.com')
    expect(normalizeDomain('example.com:3000')).toBe('example.com')
    expect(normalizeDomain('example.com.')).toBe('example.com')
  })
  it('suggests an id from a name or a domain', () => {
    expect(suggestId('www.example.com')).toBe('example')
    expect(suggestId('docs.my_site.co.uk')).toBe('docs-my-site')
    expect(suggestId('reelcn.vercel.app')).toBe('reelcn')
    expect(suggestId('Shop')).toBe('shop')
    expect(suggestId('Marketing site')).toBe('marketing-site')
    expect(suggestId('')).toBe('')
    expect(suggestId('a'.repeat(60) + '.com')).toHaveLength(40)
  })
  it('parses origins from commas, spaces or lines', () => {
    expect(parseOrigins('*.vercel.app, staging.example.com\nhttps://preview.dev/\n\n')).toEqual(['*.vercel.app', 'staging.example.com', 'preview.dev'])
  })
})
