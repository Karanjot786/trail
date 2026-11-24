import { describe, expect, it } from 'vitest'
import { suggestId } from '../../lib/install'
import { apiCall, expiresText, MCP_CLIENTS, mcpSetup, scopeText, siteFromForm } from './model'

const DAY = 86_400_000

describe('expiresText', () => {
  const now = 1_000_000_000_000
  it('says when a link stops working', () => {
    expect(expiresText(null, now)).toBe('never expires')
    expect(expiresText(now + 30 * DAY - 5000, now)).toBe('expires in 30 days')
    expect(expiresText(now + DAY, now)).toBe('expires in 1 day')
    expect(expiresText(now + 5 * 3_600_000, now)).toBe('expires in 5 hours')
    expect(expiresText(now + 1_000, now)).toBe('expires in 1 minute')
    expect(expiresText(now - 1, now)).toBe('expired')
  })
})

describe('mcpSetup', () => {
  const url = 'https://trail.example.com/mcp'
  it('has a tab per client, Claude Desktop / claude.ai first', () => {
    expect(MCP_CLIENTS.map((c) => c.label)).toEqual(['Claude Desktop / claude.ai', 'Claude Code', 'Cursor', 'VS Code', 'Codex'])
  })
  it('fills the token into every client config once there is one', () => {
    for (const c of MCP_CLIENTS) {
      const s = mcpSetup(c.key, url, 'trl_abc123')
      expect(s.code, c.key).toContain(c.key === 'desktop' ? url : 'trl_abc123')
      expect(s.code, c.key).not.toContain('${env:TRAIL_TOKEN}')
      expect(s.code, c.key).not.toContain('$TRAIL_TOKEN')
    }
  })
  it('shows a placeholder before a token exists', () => {
    expect(mcpSetup('cursor', url, null).code).toContain('${env:TRAIL_TOKEN}')
    expect(mcpSetup('code', url, null).code).toContain('Bearer $TRAIL_TOKEN')
    expect(mcpSetup('code', url, 'trl_x').code).toBe(`claude mcp add --transport http trail ${url} --header "Authorization: Bearer trl_x"`)
  })
})

describe('scopeText', () => {
  it('names what the token can do and on which site', () => {
    expect(scopeText('read', 'docs.trail.dev')).toBe('Reads stats for docs.trail.dev only')
    expect(scopeText('notes', null)).toBe('Reads stats and writes notes for every site')
    expect(scopeText('crawl', 'a.dev')).toBe('Sends crawler logs for a.dev only')
    expect(scopeText('write', null)).toBe('Reads and writes everything in the API for every site')
  })
})

describe('apiCall', () => {
  it('is a curl of /api/v1/stats with the view’s site, range, comparison and filters', () => {
    const s = apiCall('https://t.dev', 'site=demo&range=7d&f=country%3AIN')
    expect(s).toBe('curl -H "Authorization: Bearer $TRAIL_TOKEN" \\\n  "https://t.dev/api/v1/stats?site=demo&range=7d&f=country%3AIN"')
  })
})

describe('siteFromForm', () => {
  it('derives the id from the domain and cleans the domain', () => {
    expect(siteFromForm('', 'https://shop.example.com/')).toEqual({ ok: true, site: { id: suggestId('shop.example.com'), domain: 'shop.example.com', origins: [] } })
  })
  it('keeps an id the person typed', () => {
    expect(siteFromForm('my-shop', 'shop.example.com')).toMatchObject({ ok: true, site: { id: 'my-shop' } })
  })
  it('says how to fix each field', () => {
    expect(siteFromForm('', 'shop')).toEqual({ ok: false, field: 'domain', error: 'Enter a domain like example.com, without a path.' })
    expect(siteFromForm('Bad Id!', 'shop.example.com')).toEqual({ ok: false, field: 'id', error: 'Use lowercase letters, digits and dashes for the ID.' })
  })
  it.each(['localhost', '127.0.0.1', 'shop.example.com', 'my-app.vercel.app'])('accepts %s as the server does', (d) => {
    expect(siteFromForm('x', d)).toMatchObject({ ok: true, site: { domain: d } })
  })
  it.each(['shop', '*.example.com', 'a_b.com', '', '-a.com', 'a..com'])('rejects %s', (d) => {
    expect(siteFromForm('x', d)).toMatchObject({ ok: false, field: 'domain' })
  })
  it('rejects a domain longer than 253 characters', () => {
    expect(siteFromForm('x', `${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.${'e'.repeat(20)}.com`)).toMatchObject({ ok: false, field: 'domain' })
  })
})
