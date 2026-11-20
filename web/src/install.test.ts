import { describe, expect, it } from 'vitest'
import { normalizeDomain, parseOrigins, snippets, statusText, suggestId } from './install'

describe('snippets', () => {
  const all = snippets('blog', 'https://stats.example.com')
  const code = (key: string) => all.find((s) => s.key === key)!.code
  it('has the five install tabs in order', () => {
    expect(all.map((s) => s.label)).toEqual(['Script tag', 'npm', 'Next.js', 'React', 'Vercel rewrite'])
  })
  it('fills in the site id', () => {
    expect(code('script')).toContain('data-site="blog"')
    expect(code('npm')).toContain(`site: 'blog'`)
    expect(code('next')).toContain('site="blog"')
    expect(code('react')).toContain('site="blog"')
  })
  it('points at the dashboard origin', () => {
    expect(code('script')).toContain('src="https://stats.example.com/_t/t.js"')
    expect(code('script')).toContain('data-api="https://stats.example.com/_t/e"')
    expect(JSON.parse(code('vercel'))).toEqual({
      rewrites: [{ source: '/_t/:p*', destination: 'https://stats.example.com/_t/:p*' }],
    })
    expect(code('next')).toContain("destination: 'https://stats.example.com/_t/:p*'")
  })
  it('uses the npm package', () => {
    expect(code('npm')).toContain('npm i trail-analytics')
    expect(code('next')).toContain("from 'trail-analytics/next'")
    expect(code('react')).toContain("from 'trail-analytics/react'")
  })
  it('drops a trailing slash from the origin', () => {
    expect(snippets('x', 'http://localhost:8080/')[0].code).toContain('"http://localhost:8080/_t/t.js"')
  })
})

describe('statusText', () => {
  const now = 1_000_000_000_000
  const at = (lastEventAt: number | null, rejected24h = 0) => statusText({ lastEventAt, events24h: 0, rejected24h }, now)
  it('waits before the first event', () => {
    expect(at(null)).toEqual({
      state: 'waiting',
      text: 'Waiting for the first event…',
      warning: undefined,
    })
  })
  it('reports how long ago the last event was', () => {
    expect(at(now - 4_000)).toEqual({
      state: 'receiving',
      text: 'Receiving data · last event 4s ago',
      warning: undefined,
    })
    expect(at(now - 125_000).text).toBe('Receiving data · last event 2m ago')
    expect(at(now - 3 * 3600_000).text).toBe('Receiving data · last event 3h ago')
    expect(at(now - 2 * 86400_000).text).toBe('Receiving data · last event 2d ago')
    expect(at(now + 500).text).toBe('Receiving data · last event just now')
  })
  it('warns about rejected events', () => {
    expect(at(null, 12).warning).toBe("12 events were rejected because they came from a domain not on this site's list")
    expect(at(now, 1).warning).toBe("1 event was rejected because it came from a domain not on this site's list")
  })
})

describe('domain helpers', () => {
  it('normalizes a pasted URL to a bare host', () => {
    expect(normalizeDomain(' https://WWW.Example.com/pricing?x=1 ')).toBe('www.example.com')
    expect(normalizeDomain('example.com:3000')).toBe('example.com')
    expect(normalizeDomain('example.com.')).toBe('example.com')
  })
  it('suggests an id from the domain', () => {
    expect(suggestId('www.example.com')).toBe('example')
    expect(suggestId('docs.my_site.co.uk')).toBe('docs-my-site')
    expect(suggestId('reelcn.vercel.app')).toBe('reelcn')
    expect(suggestId('')).toBe('')
    expect(suggestId('a'.repeat(60) + '.com')).toHaveLength(40)
  })
  it('parses origins from commas, spaces or lines', () => {
    expect(parseOrigins('*.vercel.app, staging.example.com\nhttps://preview.dev/\n\n')).toEqual([
      '*.vercel.app',
      'staging.example.com',
      'preview.dev',
    ])
  })
})
