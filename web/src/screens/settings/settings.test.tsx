import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ApiToken, Config, InstallCheck, NewToken, Share, Site } from '../../api/types'

const H = vi.hoisted(() => ({
  sites: [] as Site[],
  check: null as InstallCheck | null,
  tokens: [] as ApiToken[],
  shares: [] as Share[],
  config: null as Config | null,
}))

vi.mock('../../api/client', async (orig) => {
  const real = await orig<typeof import('../../api/client')>()
  return {
    ...real,
    api: {
      sites: vi.fn(async () => H.sites),
      createSite: vi.fn(),
      updateSite: vi.fn(async (id: string, p: { origins?: string[] }) => ({ ...H.sites.find((s) => s.id === id)!, ...p })),
      deleteSite: vi.fn(async () => undefined),
      siteCheck: vi.fn(async () => H.check),
      siteExportUrl: (id: string) => `/api/sites/${id}/export`,
      stats: vi.fn(async () => null),
      tokens: vi.fn(async () => H.tokens),
      createToken: vi.fn(),
      deleteToken: vi.fn(async () => undefined),
      shares: vi.fn(async () => H.shares),
      deleteShare: vi.fn(async (id: string) => {
        H.shares = H.shares.filter((s) => s.id !== id)
      }),
      config: vi.fn(async () => H.config),
      views: vi.fn(async () => []),
    },
  }
})
vi.mock('./remote', () => ({ createShare: vi.fn(), testToken: vi.fn() }))

import { api, HttpError } from '../../api/client'
import { createShare, testToken } from './remote'
import { invalidate } from '../../api/useQuery'
import { startRouter, current, navigate } from '../../shell/router'
import { getUi, resetUi } from '../../shell/uiStore'
import SettingsScreen from './index'
import { AddSiteDialog } from './AddSiteDialog'
import { ShareDialog } from './ShareDialog'
import { FRAMEWORKS, snippet } from '../../lib/install'

const site = (id: string, extra: Partial<Site> = {}): Site => ({
  id, domain: `${id}.trail.dev`, origins: [], created: 0, lastEventAt: 1, events24h: 3, features: { revenue: false, crawlers: false, currency: 'USD' }, ...extra,
})
const ck = (id: InstallCheck['checks'][number]['id'], status: 'pass' | 'fail' | 'pending', code: InstallCheck['checks'][number]['code'] = 'ok', fix = '') =>
  ({ id, label: `${id} check`, status, code, detail: `${id} detail`, fix })
function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)))
const mocked = <T,>(f: T) => f as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  invalidate()
  resetUi()
  vi.clearAllMocks()
  H.sites = [site('demo'), site('docs')]
  H.check = null
  H.tokens = []
  H.shares = []
  H.config = null
})
afterEach(cleanup)

describe('Websites', () => {
  it('lists sites, marks the selected one and opens Add website', async () => {
    visit('/settings/sites?site=docs')
    render(<SettingsScreen />)
    await flush()
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeTruthy()
    expect(screen.getByText('demo.trail.dev')).toBeTruthy()
    expect(screen.getAllByTestId('status-receiving')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Add website' }))
    expect(getUi().addSite).toBe(true)
  })

  it('remove requires typing the site id', async () => {
    visit('/settings/sites?site=demo')
    render(<SettingsScreen />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Remove docs.trail.dev' }))
    const dlg = screen.getByRole('dialog', { name: /remove docs\.trail\.dev/i })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remove website' }))
    expect(api.deleteSite).not.toHaveBeenCalled()
    expect(within(dlg).getByText(/type docs to confirm/i)).toBeTruthy()
    fireEvent.change(within(dlg).getByLabelText(/type the site id/i), { target: { value: 'docs' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remove website' }))
    await flush()
    expect(api.deleteSite).toHaveBeenCalledWith('docs', false)
  })

  it('saves allowed origins', async () => {
    visit('/settings/sites?site=demo')
    render(<SettingsScreen />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Edit origins of demo.trail.dev' }))
    fireEvent.change(screen.getByRole('textbox', { name: /allowed origins/i }), { target: { value: '*.demo.dev, https://preview.demo.dev/' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save origins' }))
    await flush()
    expect(api.updateSite).toHaveBeenCalledWith('demo', { origins: ['*.demo.dev', 'preview.demo.dev'] })
  })
})

describe('AddSiteDialog', () => {
  it('submits the name as the id and hands back the site', async () => {
    const added = site('shop', { domain: 'shop.example.com', lastEventAt: null })
    mocked(api.createSite).mockResolvedValue(added)
    const onAdded = vi.fn()
    render(<AddSiteDialog open onOpenChange={() => {}} onAdded={onAdded} />)
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Shop' } })
    fireEvent.change(screen.getByLabelText(/^domain/i), { target: { value: 'https://shop.example.com/' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add and install' }))
    await flush()
    expect(api.createSite).toHaveBeenCalledWith({ id: 'shop', domain: 'shop.example.com', origins: [] })
    expect(onAdded).toHaveBeenCalledWith(added)
  })

  it('a 409 says the id is taken, next to the id field', async () => {
    mocked(api.createSite).mockRejectedValue(new HttpError(409, 'site already exists'))
    render(<AddSiteDialog open onOpenChange={() => {}} onAdded={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Demo' } })
    fireEvent.change(screen.getByLabelText(/^domain/i), { target: { value: 'demo.dev' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add and install' }))
    await flush()
    expect(screen.getByText(/That id is taken/)).toBeTruthy()
    expect(screen.getByLabelText(/^site id/i).getAttribute('aria-invalid')).toBe('true')
  })
})

describe('Install', () => {
  it('the snippet carries the real site id for every framework', async () => {
    H.check = { state: 'waiting', checkedAt: 1, lastEventAt: null, checks: [ck('page', 'pass'), ck('first_event', 'pending', 'no_events')] }
    visit('/settings/install?site=docs')
    render(<SettingsScreen />)
    await flush()
    for (const f of FRAMEWORKS) {
      fireEvent.click(screen.getByRole('tab', { name: f.label }))
      expect(document.body.textContent).toContain(snippet(f.key, 'docs', location.origin).code.split('\n')[0])
    }
  })

  it('the status line and the checklist read the same response', async () => {
    H.check = {
      state: 'blocked', checkedAt: 1, lastEventAt: null,
      checks: [ck('page', 'pass'), ck('csp', 'fail', 'csp_blocked', "Add https://t.dev to connect-src in your Content-Security-Policy"), ck('first_event', 'pending', 'no_events')],
    }
    visit('/settings/install?site=docs')
    render(<SettingsScreen />)
    await flush()
    expect(screen.getByTestId('install-state').textContent).toContain('Blocked: your Content Security Policy blocks Trail')
    const list = screen.getByRole('list', { name: 'Install checks' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getByText('csp_blocked')).toBeTruthy()
    expect(within(list).getByText(/connect-src in your Content-Security-Policy/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'I fixed it, test again' })).toBeTruthy()
  })

  it('receiving offers Watch it live', async () => {
    H.check = { state: 'receiving', checkedAt: 1, lastEventAt: 5, checks: [ck('page', 'pass')] }
    visit('/settings/install?site=docs')
    render(<SettingsScreen />)
    await flush()
    expect(screen.getByTestId('install-state').textContent).toContain('Receiving data')
    expect(screen.getByRole('link', { name: /watch it live/i }).getAttribute('href')).toContain('/live?site=docs')
  })
})

describe('AI assistants', () => {
  const tok: NewToken = { id: 't1', name: 'Cursor at work', prefix: 'trl_abcdefgh', scope: 'read', site: 'docs', created: 1, lastUsed: null, fromEnv: false, token: 'trl_abcdefghSECRET' }

  it('preselects the current site, fills the token into the config and tests it', async () => {
    mocked(api.createToken).mockResolvedValue(tok)
    mocked(testToken).mockResolvedValue({ ok: true, who: { name: 'Cursor at work', scope: 'read', site: 'docs' }, ms: 12 })
    visit('/settings/assistants?site=docs')
    render(<SettingsScreen />)
    await flush()
    expect((screen.getByRole('checkbox', { name: /docs\.trail\.dev only/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /demo\.trail\.dev only/ }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    await flush()
    expect(screen.getByTestId('mcp-result').textContent).toMatch(/no token yet/)
    fireEvent.click(screen.getByRole('tab', { name: 'Cursor' }))
    expect(document.body.textContent).toContain('${env:TRAIL_TOKEN}')
    fireEvent.change(screen.getByLabelText(/token name/i), { target: { value: 'Cursor at work' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }))
    await flush()
    expect(api.createToken).toHaveBeenCalledWith({ name: 'Cursor at work', scope: 'read', site: 'docs' })
    for (const t of ['Claude Code', 'Cursor', 'VS Code', 'Codex']) {
      fireEvent.click(screen.getByRole('tab', { name: t }))
      expect(document.body.textContent, t).toContain('trl_abcdefghSECRET')
      expect(document.body.textContent, t).not.toContain('${env:TRAIL_TOKEN}')
    }
    expect(document.body.textContent).toContain('docs.trail.dev only')
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    await flush()
    expect(testToken).toHaveBeenCalledWith('trl_abcdefghSECRET')
    expect(screen.getByTestId('mcp-result').textContent).toMatch(/Connected/)
  })

  it('a rejected token says 401 token_invalid and what to do', async () => {
    mocked(api.createToken).mockResolvedValue(tok)
    mocked(testToken).mockResolvedValue({ ok: false, status: 401 })
    visit('/settings/assistants?site=docs')
    render(<SettingsScreen />)
    await flush()
    fireEvent.change(screen.getByLabelText(/token name/i), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    await flush()
    expect(screen.getByTestId('mcp-result').textContent).toMatch(/401 token_invalid.*Create a new token/)
  })
})

describe('API tokens', () => {
  it('lists tokens, marks env tokens, and shows a new token once', async () => {
    H.tokens = [
      { id: 'env:ci', name: 'ci', prefix: '', scope: 'read', site: null, created: 0, lastUsed: null, fromEnv: true },
      { id: 'a', name: 'laptop', prefix: 'trl_12345678', scope: 'notes', site: 'demo', created: 1, lastUsed: null, fromEnv: false },
    ]
    mocked(api.createToken).mockResolvedValue({ id: 'b', name: 'crawler', prefix: 'trl_zzzz', scope: 'crawl', site: 'demo', created: 2, lastUsed: null, fromEnv: false, token: 'trl_zzzzSECRET' })
    visit('/settings/tokens?site=demo')
    render(<SettingsScreen />)
    await flush()
    expect(screen.getByText(/TRAIL_API_TOKENS/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Revoke ci' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Revoke laptop' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New token' }))
    fireEvent.change(screen.getByLabelText(/token name/i), { target: { value: 'crawler' } })
    fireEvent.click(screen.getByRole('radio', { name: /crawler logs/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }))
    await flush()
    expect(api.createToken).toHaveBeenCalledWith({ name: 'crawler', scope: 'crawl', site: 'demo' })
    expect(document.body.textContent).toContain('trl_zzzzSECRET')
    fireEvent.click(screen.getByRole('button', { name: 'Done, I copied it' }))
    expect(document.body.textContent).not.toContain('trl_zzzzSECRET')
  })

  it('revoke asks first', async () => {
    H.tokens = [{ id: 'a', name: 'laptop', prefix: 'trl_12345678', scope: 'read', site: null, created: 1, lastUsed: null, fromEnv: false }]
    visit('/settings/tokens?site=demo')
    render(<SettingsScreen />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Revoke laptop' }))
    expect(api.deleteToken).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke token' }))
    await flush()
    expect(api.deleteToken).toHaveBeenCalledWith('a')
  })
})

describe('ShareDialog', () => {
  it('lists what the link carries, sends hide revenue and the expiry, and revokes', async () => {
    H.sites = [site('demo', { features: { revenue: true, crawlers: false, currency: 'USD' } })]
    mocked(createShare).mockImplementation(async (b: { site: string; label: string; state: string; hideRevenue: boolean }) => {
      const sh: Share = { id: 'sh1abc', label: b.label, site: b.site, state: b.state, hideRevenue: b.hideRevenue, created: Date.now(), expires: Date.now() + 30 * 86_400_000, lastUsed: null, url: '/share/shr_x/' }
      H.shares = [sh]
      return sh
    })
    visit('/?site=demo&f=country:IN&f=device:mobile')
    render(<ShareDialog open onOpenChange={() => {}} />)
    await flush()
    const dlg = screen.getByRole('dialog', { name: /share/i })
    expect(dlg.textContent).toContain('Anyone with the link')
    expect(dlg.textContent).toContain('Country is IN')
    expect(dlg.textContent).toContain('Device is mobile')
    fireEvent.click(within(dlg).getByRole('switch', { name: 'Hide revenue' }))
    fireEvent.click(within(dlg).getByRole('radio', { name: '30 days' }))
    fireEvent.click(within(dlg).getByRole('button', { name: /create/i }))
    await flush()
    expect(createShare).toHaveBeenCalledWith(expect.objectContaining({ site: 'demo', hideRevenue: true, ttl: '30d', state: current() && 'site=demo&f=country%3AIN&f=device%3Amobile' }))
    expect(dlg.textContent).toContain('expires in 30 days')
    fireEvent.click(within(dlg).getByRole('button', { name: /revoke/i }))
    await flush()
    expect(api.deleteShare).toHaveBeenCalledWith('sh1abc')
    expect(dlg.textContent).not.toContain('expires in 30 days')
  })
})

describe('ShareDialog state', () => {
  it('Hide revenue is off again after switching site', async () => {
    const rev = { revenue: true, crawlers: false, currency: 'USD' }
    H.sites = [site('demo', { features: rev }), site('docs', { features: rev })]
    visit('/?site=docs')
    const { rerender } = render(<ShareDialog open onOpenChange={() => {}} />)
    await flush()
    let dlg = screen.getByRole('dialog', { name: /share/i })
    fireEvent.click(within(dlg).getByRole('switch', { name: 'Hide revenue' }))
    expect(within(dlg).getByRole('switch', { name: 'Hide revenue' }).getAttribute('aria-checked')).toBe('true')
    rerender(<ShareDialog open={false} onOpenChange={() => {}} />)
    act(() => navigate({ site: 'demo' }))
    rerender(<ShareDialog open onOpenChange={() => {}} />)
    await flush()
    dlg = screen.getByRole('dialog', { name: /share/i })
    expect(within(dlg).getByRole('switch', { name: 'Hide revenue' }).getAttribute('aria-checked')).toBe('false')
  })
})

describe('Sharing, Data and Config', () => {
  it('Sharing lists every link with Revoke', async () => {
    H.shares = [{ id: 's1', label: 'Last 30 days', site: 'docs', state: '', hideRevenue: false, created: 1, expires: null, lastUsed: null }]
    visit('/settings/sharing?site=demo')
    render(<SettingsScreen />)
    await flush()
    expect(document.body.textContent).toContain('never expires')
    expect(screen.getByRole('button', { name: /revoke/i })).toBeTruthy()
  })

  it('the export link points at the current site', async () => {
    visit('/settings/data?site=docs')
    render(<SettingsScreen />)
    await flush()
    expect(screen.getByRole('link', { name: /export all events/i }).getAttribute('href')).toBe('/api/sites/docs/export')
  })

  it('config renders every field and the current view as an API call', async () => {
    H.config = { version: 'v9.9.9', tz: 'Asia/Kolkata', demo: false, geo: { source: 'embedded-country', build: '2026-11' }, ingestRps: 50, envSites: ['demo', 'docs'], envTokens: 2, dbFile: 'trail.db' }
    visit('/settings/config?site=docs&range=7d')
    render(<SettingsScreen />)
    await flush()
    const t = document.body.textContent ?? ''
    for (const v of ['v9.9.9', 'Asia/Kolkata', 'trail.db', '50', 'demo, docs', '2']) expect(t).toContain(v)
    expect(t).toContain('/api/v1/stats?site=docs&range=7d')
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy()
  })

  it('config credits DB-IP when the built-in country database answers', async () => {
    H.config = { version: 'v', tz: 'UTC', demo: false, geo: { source: 'embedded-country', build: '2026-11' }, ingestRps: 0, envSites: [], envTokens: 0, dbFile: 'trail.db' }
    visit('/settings/config')
    render(<SettingsScreen />)
    await flush()
    expect(document.body.textContent).toContain('Countries, built in (2026-11)')
    const credit = screen.getByRole('link', { name: 'IP geolocation by DB-IP' })
    expect(credit.getAttribute('href')).toBe('https://db-ip.com')
  })

  it('config names a custom geo database and drops the DB-IP credit', async () => {
    H.config = { version: 'v', tz: 'UTC', demo: false, geo: { source: 'custom', build: '2026-10' }, ingestRps: 0, envSites: [], envTokens: 0, dbFile: 'trail.db' }
    visit('/settings/config')
    render(<SettingsScreen />)
    await flush()
    expect(document.body.textContent).toContain('Your database (2026-10)')
    expect(screen.queryByRole('link', { name: 'IP geolocation by DB-IP' })).toBeNull()
  })
})
