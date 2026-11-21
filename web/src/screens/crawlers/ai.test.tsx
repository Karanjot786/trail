import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { AISetup, AIVisibility, Agents, Crawlers } from '../../api/types'
import { site, stats } from '../../shell/testkit'
import * as td from './testdata'

const m = vi.hoisted(() => ({
  cr: null as unknown as Crawlers,
  vis: null as unknown as AIVisibility,
  ag: null as unknown as Agents,
  setup: null as unknown as AISetup,
  tokenFails: 0,
}))

vi.mock('../../api/client', async (orig) => {
  const real = await orig<typeof import('../../api/client')>()
  return {
    ...real,
    api: {
      ...real.api,
      sites: vi.fn(async () => [site('demo'), site('docs')]),
      stats: vi.fn(async () => ({ ...stats(), botRequests: m.cr.configured ? m.cr.total : null, agentSessions: 42 })),
      crawlers: vi.fn(async () => m.cr),
      aiVisibility: vi.fn(async () => m.vis),
      agents: vi.fn(async () => m.ag),
      aiSetup: vi.fn(async () => m.setup),
      createToken: vi.fn(async (t: { name: string; scope: string; site: string | null }) => {
        if (m.tokenFails > 0) {
          m.tokenFails--
          throw new real.HttpError(409, 'a token with this name exists')
        }
        return { id: 't1', name: t.name, prefix: 'trl_abc', scope: t.scope, site: t.site, created: 0, lastUsed: null, fromEnv: false, token: 'trl_abcdef123456' }
      }),
    },
  }
})

import AIScreen from './index'
import { api } from '../../api/client'
import { current, startRouter } from '../../shell/router'
import { invalidate } from '../../api/useQuery'
import { AgentBadge } from './AgentBadge'
import { SETUP_POLL_MS } from './UnlockCard'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 30)))

beforeEach(() => {
  invalidate()
  vi.clearAllMocks()
  m.cr = td.crawlers()
  m.vis = td.visibility()
  m.ag = td.agents()
  m.setup = td.setup('receiving')
  m.tokenFails = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AI visibility tabs', () => {
  it('/ai shows Funnel, Crawlers and Agents with Funnel selected; Crawlers routes to /ai/crawlers', async () => {
    visit('/ai?site=demo')
    render(<AIScreen />)
    await flush()
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['Funnel', 'Crawlers', 'Agents'])
    expect(screen.getByRole('tab', { name: 'Funnel' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Crawlers' }))
    expect(location.pathname).toBe('/ai/crawlers')
    expect(current().tab).toBe('crawlers')
  })

  it('site=all shows "Pick a website" on every tab', async () => {
    for (const tab of ['funnel', 'crawlers', 'agents']) {
      visit(`/ai/${tab}?site=all`)
      render(<AIScreen />)
      expect(screen.getByText('Pick a website')).toBeTruthy()
      cleanup()
    }
  })
})

describe('Crawlers tab', () => {
  it('not configured: the Unlock card, with the log importers under Other ways', async () => {
    m.cr = { ...td.crawlers(), configured: false, total: 0, pages: [], providers: [], categories: [], series: [] }
    m.setup = td.setup('none')
    visit('/ai/crawlers?site=demo')
    render(<AIScreen />)
    await flush()
    const card = screen.getByRole('region', { name: 'Unlock AI crawlers' })
    const other = within(card).getByText('Other ways (server logs, any proxy)')
    fireEvent.click(other)
    const code = () => [...card.querySelectorAll('pre code')].map((c) => c.textContent).join('\n')
    expect(code()).toContain(`trail crawlers import --site demo --url ${location.origin} --token TOKEN -`)
    fireEvent.click(within(card).getByRole('tab', { name: 'Caddy' }))
    expect(code()).toContain('--format caddy')
    fireEvent.click(within(card).getByRole('tab', { name: 'Any proxy' }))
    expect(code()).toContain(`${location.origin}/api/v1/crawls`)
    expect(within(card).getByRole('link', { name: 'Create a crawl token' }).getAttribute('href')).toMatch(/\/settings\/tokens/)
  })

  it('the top page row has a full bar, and the total matches the freshness line’s bot count', async () => {
    m.vis = { ...td.visibility(), verifiedShare: null }
    visit('/ai/crawlers?site=demo')
    render(<AIScreen />)
    const table = await screen.findByRole('table')
    await within(table).findByText('/docs')
    const bars = table.querySelectorAll<HTMLElement>('[data-bar]')
    expect(bars[0].style.transform).toBe('scaleX(1)')
    expect(bars[1].style.transform).toBe('scaleX(0.25)')
    const st = await api.stats(new URLSearchParams())
    expect(screen.getAllByText(st.botRequests!.toLocaleString('en-US')).length).toBeGreaterThan(0)
    expect(screen.getByText(/By user agent; not verified by IP/)).toBeTruthy()
  })

  it('with a verified share, the method says how many requests came from listed IPs', async () => {
    visit('/ai/crawlers?site=demo')
    render(<AIScreen />)
    await screen.findByRole('table')
    await flush()
    expect(screen.getByText(/82% of requests among crawlers that publish IPs/)).toBeTruthy()
  })

  it('a single day widens to the last 7 days, and says so', async () => {
    visit('/ai/crawlers?site=demo&range=today')
    render(<AIScreen />)
    expect(await screen.findByText(/Showing the last 7 days: crawler data is daily/)).toBeTruthy()
  })
})

describe('Funnel tab', () => {
  const funnel = () => screen.getByRole('region', { name: 'AI visibility funnel' })
  const step = (k: string) => funnel().querySelector<HTMLElement>(`[data-step="${k}"]`)!

  it('renders the 5 steps with their units; cited shows "No public source" and no number', async () => {
    visit('/ai/funnel?site=demo')
    render(<AIScreen />)
    await flush()
    expect(within(funnel()).getAllByRole('listitem')).toHaveLength(5)
    expect(step('crawled').textContent).toContain('7,006')
    expect(step('fetched').textContent).toContain('370')
    expect(step('visited').textContent).toContain('sessions')
    expect(step('converted').textContent).toContain('people, first touch')
    const cited = step('cited')
    expect(cited.textContent).toContain('No public source')
    expect(cited.querySelector('.v')!.textContent).toBe('No public source')
    expect(cited.querySelector('.s')!.textContent).not.toMatch(/\d/)
    expect(within(cited).getByRole('button', { name: 'Cited' })).toBeTruthy()
    // No % conversion between steps: values and the ratio carry their own units (deltas compare a step with itself).
    for (const v of funnel().querySelectorAll('.v, .aif-ratio')) expect(v.textContent).not.toContain('%')
  })

  it('the ratio between fetched and visited reads "37 answer fetches per visit"', async () => {
    visit('/ai/funnel?site=demo')
    render(<AIScreen />)
    await flush()
    expect(within(funnel()).getByText('37 answer fetches per visit')).toBeTruthy()
  })

  it('no visits: the ratio reads "no visits yet"', async () => {
    m.vis = { ...td.visibility(), steps: td.visibility().steps.map((s) => (s.key === 'visited' ? { ...s, value: 0 } : s)) }
    visit('/ai/funnel?site=demo')
    render(<AIScreen />)
    await flush()
    expect(within(funnel()).getByText('no visits yet')).toBeTruthy()
  })

  it('not set up: crawler steps read "Not set up" and the Unlock card shows', async () => {
    m.vis = td.notSetUp()
    m.setup = td.setup('none')
    visit('/ai/funnel?site=docs')
    render(<AIScreen />)
    await flush()
    expect(step('crawled').textContent).toContain('Not set up')
    expect(step('fetched').textContent).toContain('Not set up')
    expect(step('visited').textContent).toContain('10')
    expect(screen.getByRole('region', { name: 'Unlock AI crawlers' })).toBeTruthy()
    expect(screen.getByText('Not receiving yet')).toBeTruthy()
  })

  it('set up: a one-line server hook status instead of the card', async () => {
    visit('/ai/funnel?site=demo')
    render(<AIScreen />)
    await flush()
    expect(screen.queryByRole('region', { name: 'Unlock AI crawlers' })).toBeNull()
    expect(screen.getByText('Receiving')).toBeTruthy()
    expect(screen.getByText(/last crawler request/)).toBeTruthy()
  })

  it('no goal: converted links to Set up a goal', async () => {
    m.vis = { ...td.visibility(), conv: null, steps: td.visibility().steps.map((s) => (s.key === 'converted' ? { ...s, value: null, prev: null, status: 'no_goal' } : s)) }
    visit('/ai/funnel?site=demo')
    render(<AIScreen />)
    await flush()
    const a = within(step('converted')).getByRole('link', { name: 'Set up a goal' })
    expect(a.getAttribute('href')).toMatch(/\/conversions\/goals/)
  })

  it('pages: the table is captioned, and an empty list shows the empty state', async () => {
    visit('/ai/funnel?site=demo')
    render(<AIScreen />)
    const t = await screen.findByRole('table', { name: 'Pages AI systems requested' })
    await within(t).findByText('/docs')
    cleanup()
    invalidate()
    m.vis = { ...td.visibility(), pages: [] }
    visit('/ai/funnel?site=demo')
    render(<AIScreen />)
    expect(await screen.findByText(/No pages requested by AI systems/)).toBeTruthy()
  })
})

describe('Unlock AI crawlers card', () => {
  beforeEach(() => {
    m.vis = td.notSetUp()
    m.setup = td.setup('none')
  })

  it('creates one crawl token for the site and fills the command', async () => {
    const write = vi.fn(async (_t: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    visit('/ai/funnel?site=docs')
    render(<AIScreen />)
    await flush()
    const card = screen.getByRole('region', { name: 'Unlock AI crawlers' })
    expect(card.querySelector('pre code')!.textContent).toBe(`npx trail-analytics@latest init --url ${location.origin} --site docs --token <token>`)
    fireEvent.click(within(card).getByRole('button', { name: 'Create token and copy command' }))
    await flush()
    expect(api.createToken).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.createToken).mock.calls[0][0]).toMatchObject({ scope: 'crawl', site: 'docs' })
    expect(vi.mocked(api.createToken).mock.calls[0][0].name).toMatch(/^crawl docs\.trail\.dev \d{4}-\d\d-\d\d \d\d:\d\d$/)
    const cmd = `npx trail-analytics@latest init --url ${location.origin} --site docs --token trl_abcdef123456`
    expect(card.querySelector('pre code')!.textContent).toBe(cmd)
    expect(write).toHaveBeenCalledWith(cmd)
    expect(within(card).getByText('The token is shown once. Revoke it in Settings → API tokens.')).toBeTruthy()
  })

  it('a 409 retries once with a (2) suffix', async () => {
    m.tokenFails = 1
    visit('/ai/funnel?site=docs')
    render(<AIScreen />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Create token and copy command' }))
    await flush()
    const calls = vi.mocked(api.createToken).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1][0].name).toBe(`${calls[0][0].name} (2)`)
  })

  it('demo mode disables the button and keeps the placeholder', async () => {
    visit('/demo/ai/funnel?site=docs')
    render(<AIScreen />)
    await flush()
    const btn = screen.getByRole('button', { name: 'Create token and copy command' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(screen.getByText(/The demo is read-only/)).toBeTruthy()
    expect(document.querySelector('.ai-unlock pre code')!.textContent).toContain('--token <token>')
  })

  it.each([
    ['receiving', 'Receiving'],
    ['quiet', 'Nothing in the last 24 hours'],
    ['none', 'Not receiving yet'],
  ] as const)('state %s reads "%s"', async (state, text) => {
    m.setup = td.setup(state)
    m.cr = { ...td.crawlers(), configured: false }
    visit('/ai/crawlers?site=docs')
    render(<AIScreen />)
    await flush()
    expect(screen.getByText(text)).toBeTruthy()
    if (state === 'none') expect(screen.getByText(/Crawlers visit irregularly; the first request can take hours/)).toBeTruthy()
  })

  it('polls every 10 s while nothing has arrived, and stops once receiving', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    visit('/ai/funnel?site=docs')
    render(<AIScreen />)
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)))
    const n0 = vi.mocked(api.aiSetup).mock.calls.length
    await act(async () => void (await vi.advanceTimersByTimeAsync(SETUP_POLL_MS + 10)))
    expect(vi.mocked(api.aiSetup).mock.calls.length).toBe(n0 + 1)
    m.setup = td.setup('receiving')
    await act(async () => void (await vi.advanceTimersByTimeAsync(SETUP_POLL_MS + 10)))
    const n1 = vi.mocked(api.aiSetup).mock.calls.length
    expect(screen.getByText('Receiving')).toBeTruthy()
    await act(async () => void (await vi.advanceTimersByTimeAsync(3 * SETUP_POLL_MS)))
    expect(vi.mocked(api.aiSetup).mock.calls.length).toBe(n1)
  })
})

describe('Agents tab', () => {
  it('renders the counts, the cards and both tables', async () => {
    visit('/ai/agents?site=demo')
    render(<AIScreen />)
    await flush()
    expect(screen.getByText('Agent sessions')).toBeTruthy()
    expect(screen.getAllByText('42').length).toBeGreaterThan(0)
    expect(screen.getByText('71%')).toBeTruthy() // 30 of 42 verified
    expect(screen.getByText('30 of 42 sessions')).toBeTruthy()
    expect(screen.getByText(/They are left out of visitor numbers/)).toBeTruthy()
    expect(await screen.findByRole('table', { name: 'Latest agent sessions' })).toBeTruthy()
    expect(await screen.findByRole('table', { name: 'Pages agents viewed' })).toBeTruthy()
    expect(screen.getByText(/Lists updated 3 h ago/)).toBeTruthy()
    expect(screen.getByText(/Perplexity Comet or Claude in Chrome/)).toBeTruthy()
  })

  it('actor=all says agents are counted as visitors', async () => {
    visit('/ai/agents?site=demo&actor=all')
    render(<AIScreen />)
    await flush()
    expect(screen.getByText(/They are counted as visitors right now/)).toBeTruthy()
  })

  it('lists unavailable: identified by user agent only', async () => {
    m.setup = { ...td.setup('receiving'), lists: [{ name: 'google-agents', kind: 'ip', fetchedAt: null, entries: 0, ok: false }] }
    visit('/ai/agents?site=demo')
    render(<AIScreen />)
    await flush()
    expect(screen.getByText(/Lists unavailable: agents are identified by user agent only/)).toBeTruthy()
  })

  it('a latest row opens the journey at that session', async () => {
    visit('/ai/agents?site=demo')
    render(<AIScreen />)
    const t = await screen.findByRole('table', { name: 'Latest agent sessions' })
    const row = await within(t).findByRole('row', { name: /^Claude agent, .*Open the journey$/ })
    fireEvent.click(row)
    expect(current().sheet).toEqual({ kind: 'journey', person: 'pa1', session: 's-a1' })
    expect(decodeURIComponent(location.search)).toContain('v=pa1~s-a1')
  })

  it('empty: "No AI agents" with the explanation', async () => {
    m.ag = td.emptyAgents()
    visit('/ai/agents?site=demo')
    render(<AIScreen />)
    await flush()
    expect(screen.getByText('No AI agents in the last 30 days')).toBeTruthy()
    expect(screen.getByText(/Nothing to set up/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })
})

describe('AgentBadge', () => {
  it.each([
    ['sig', 'Verified', 'Signed request (Web Bot Auth)'],
    ['relay', 'Verified', 'Signed request seen by your server hook'],
    ['ip', 'Verified', 'IP in Anthropic’s published list'],
    ['ua', 'Claimed', 'User agent only; not verified'],
  ] as const)('%s → %s', (via, name, tip) => {
    render(<AgentBadge via={via} provider="Anthropic" />)
    expect(screen.getByText(name)).toBeTruthy()
    expect(document.querySelector('[data-tip]')!.getAttribute('data-tip')).toBe(tip)
    expect(document.querySelector('.sr-only')!.textContent).toBe(`: ${tip}`)
  })
})
