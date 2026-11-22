import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Site, SiteStatus } from '../../api/types'

const H = vi.hoisted(() => ({ sites: [] as Site[], status: { lastEventAt: null, events24h: 0, rejected24h: 0, geo: null } as SiteStatus }))

vi.mock('../../api/client', async (orig) => {
  const real = await orig<typeof import('../../api/client')>()
  return {
    ...real,
    api: {
      sites: vi.fn(async () => H.sites),
      createSite: vi.fn(),
      siteStatus: vi.fn(async () => H.status),
      siteCheck: vi.fn(async () => ({ state: 'waiting', checkedAt: 0, lastEventAt: null, checks: [] })),
      createToken: vi.fn(),
      login: vi.fn(),
    },
  }
})

import { api, HttpError } from '../../api/client'
import { invalidate } from '../../api/useQuery'
import { current, startRouter } from '../../shell/router'
import { Login, loginError } from '../../shell/Login'
import Onboarding from './Onboarding'

const site = (id: string, lastEventAt: number | null = null): Site => ({
  id, domain: `${id}.example.com`, origins: [], created: 0, lastEventAt, events24h: 0, features: { revenue: false, crawlers: false, currency: 'USD' },
})
const mocked = <T,>(f: T) => f as unknown as ReturnType<typeof vi.fn>
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)))
function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}

beforeEach(() => {
  invalidate()
  vi.clearAllMocks()
  localStorage.clear()
  H.sites = []
  H.status = { lastEventAt: null, events24h: 0, rejected24h: 0, geo: null }
})
afterEach(cleanup)

describe('Onboarding', () => {
  it('step 1 normalises the domain, fills the site ID and creates the site', async () => {
    visit('/welcome/site')
    mocked(api.createSite).mockImplementation(async (s: { id: string; domain: string }) => site(s.id))
    render(<Onboarding />)
    await flush()
    expect(screen.getByRole('heading', { level: 1, name: 'Add your website' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Setup steps' }).querySelector('[aria-current="step"]')?.textContent).toMatch(/Website/)
    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'https://www.Shop.example.com/pricing' } })
    expect((screen.getByLabelText('Site ID') as HTMLInputElement).value).toBe('shop-example')
    expect(screen.getByText('Saved as www.shop.example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Add website/ }))
    await flush()
    expect(api.createSite).toHaveBeenCalledWith({ id: 'shop-example', domain: 'www.shop.example.com', origins: [] })
    expect(current()).toMatchObject({ screen: 'welcome', tab: 'install', site: 'shop-example' })
  })

  it('step 1 shows field errors and a taken ID', async () => {
    visit('/welcome/site')
    render(<Onboarding />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /Add website/ }))
    expect(screen.getByRole('alert').textContent).toMatch(/domain/)
    expect(screen.getByLabelText('Domain').getAttribute('aria-invalid')).toBe('true')
    mocked(api.createSite).mockRejectedValue(new HttpError(409, 'exists'))
    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Add website/ }))
    await flush()
    expect(screen.getByRole('alert').textContent).toBe('That ID is taken. Try example-2.')
  })

  it('step 2 fills the snippet with this server and the site ID, and mints a crawl token for the init command', async () => {
    H.sites = [site('mysite')]
    visit('/welcome/install?site=mysite')
    mocked(api.createToken).mockResolvedValue({ id: 't', name: 'n', prefix: 'trl_', scope: 'crawl', site: 'mysite', created: 0, lastUsed: null, fromEnv: false, token: 'trl_secret' })
    render(<Onboarding />)
    await flush()
    expect(screen.getByRole('heading', { level: 1, name: 'Install the script' })).toBeTruthy()
    expect(document.querySelector('pre')!.textContent).toContain(`src="${location.origin}/_t/t.js" data-site="mysite"`)
    fireEvent.click(screen.getByRole('tab', { name: 'Next.js / Astro' }))
    fireEvent.click(screen.getByRole('button', { name: /Create token/ }))
    await flush()
    expect(api.createToken).toHaveBeenCalledWith(expect.objectContaining({ scope: 'crawl', site: 'mysite' }))
    expect(document.querySelector('pre')!.textContent).toBe(`npx trail-analytics@latest init --url ${location.origin} --site mysite --token trl_secret`)
    fireEvent.click(screen.getByRole('tab', { name: 'Other / npm' }))
    expect(document.querySelector('pre')!.textContent).toContain("inject({ site: 'mysite'")
    fireEvent.click(screen.getByRole('button', { name: /check now/ }))
    expect(current()).toMatchObject({ tab: 'verify', site: 'mysite' })
  })

  it('step 3 waits, then moves to Done when the first event arrives', async () => {
    H.sites = [site('mysite')]
    visit('/welcome/verify?site=mysite')
    render(<Onboarding />)
    await flush()
    expect(screen.getByTestId('onb-status').textContent).toMatch(/Waiting for your first visit/)
    expect(screen.getByRole('button', { name: /Send a test visit/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Run the install checks' }))
    await flush()
    expect(api.siteCheck).toHaveBeenCalled()
    H.status = { ...H.status, lastEventAt: 1000 }
    invalidate('site-status')
    await flush()
    await flush()
    expect(current()).toMatchObject({ tab: 'done', site: 'mysite' })
    expect(screen.getByRole('heading', { level: 1, name: 'Receiving data' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Go to Overview/ }))
    expect(current()).toMatchObject({ screen: 'overview', site: 'mysite' })
  })

  it('a late step without a site goes back to step 1', async () => {
    H.sites = []
    visit('/welcome/verify?site=gone')
    render(<Onboarding />)
    await flush()
    expect(current()).toMatchObject({ tab: 'site' })
  })

  it('"I’ll do this later" remembers the site and opens its Overview', async () => {
    H.sites = [site('mysite')]
    visit('/welcome/install?site=mysite')
    render(<Onboarding />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'I’ll do this later' }))
    expect(current()).toMatchObject({ screen: 'overview', site: 'mysite' })
    expect(JSON.parse(localStorage.getItem('trail.onboarding.skipped')!)).toEqual(['mysite'])
  })

  it('adding another site from the switcher offers Cancel, which skips nothing', async () => {
    H.sites = [site('a', 5)]
    visit('/welcome/site?site=a')
    render(<Onboarding />)
    await flush()
    expect(screen.getByText('New website')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(current()).toMatchObject({ screen: 'overview', site: 'a' })
    expect(localStorage.getItem('trail.onboarding.skipped')).toBeNull()
  })
})

describe('Login', () => {
  it('classifies failures', () => {
    expect(loginError({ ok: true })).toBeNull()
    expect(loginError({ ok: false })).toBe('wrong')
    expect(loginError({ error: new TypeError('Failed to fetch') })).toBe('unreachable')
    expect(loginError({ error: new HttpError(502, 'bad gateway') })).toBe('unreachable')
    expect(loginError({ error: new HttpError(429, 'slow down') })).toBe('busy')
    expect(loginError({ error: new HttpError(400, 'bad request') })).toBe('other')
  })

  it('shows and hides the password, says wrong vs unreachable, then signs in', async () => {
    const done = vi.fn()
    render(<Login onDone={done} />)
    const pw = screen.getByLabelText('Password') as HTMLInputElement
    expect(pw.type).toBe('password')
    const eye = screen.getByRole('button', { name: 'Show password' })
    fireEvent.click(eye)
    expect(pw.type).toBe('text')
    expect(eye.getAttribute('aria-pressed')).toBe('true')

    fireEvent.change(pw, { target: { value: 'nope' } })
    mocked(api.login).mockResolvedValueOnce(false)
    fireEvent.submit(pw.form!)
    await flush()
    expect(screen.getByRole('alert').textContent).toMatch(/not right/)
    expect(pw.getAttribute('aria-invalid')).toBe('true')

    mocked(api.login).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fireEvent.submit(pw.form!)
    await flush()
    expect(screen.getByRole('alert').textContent).toMatch(/Can’t reach the Trail server/)
    expect(pw.getAttribute('aria-invalid')).toBeNull()

    mocked(api.login).mockResolvedValueOnce(true)
    fireEvent.submit(pw.form!)
    await flush()
    expect(api.login).toHaveBeenLastCalledWith('nope')
    expect(done).toHaveBeenCalledOnce()
  })

  it('points to TRAIL_PASSWORD and the server log', () => {
    render(<Login onDone={() => undefined} />)
    expect(screen.getByText('Where’s my password?')).toBeTruthy()
    expect(document.querySelector('.login-help')!.textContent).toMatch(/TRAIL_PASSWORD[\s\S]*server log/)
  })
})
