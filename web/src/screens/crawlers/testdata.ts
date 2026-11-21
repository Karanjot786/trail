// Typed samples of the AI visibility contract (plan §0.4) for the crawlers screen tests.
import type { AISetup, AIVisibility, Agents, Crawlers } from '../../api/types'
import { win } from '../../shell/testkit'

const H = 3_600_000
export const NOW = Date.now()

export function crawlers(): Crawlers {
  return {
    configured: true,
    window: win,
    total: 8006,
    prevTotal: 7000,
    categories: [
      { key: 'training', requests: 5000, prev: 4000 },
      { key: 'indexing', requests: 2000, prev: 2000 },
      { key: 'fetch', requests: 1000, prev: 900 },
      { key: 'general', requests: 6, prev: 100 },
    ],
    providers: [{ provider: 'OpenAI', crawlers: [{ name: 'GPTBot', category: 'training', requests: 5000, prev: 4000 }] }],
    series: [{ t: 0, training: 10, indexing: 5, fetch: 2, general: 0 }],
    pages: [
      { path: '/docs', provider: 'OpenAI', crawler: 'GPTBot', category: 'training', requests: 400, lastSeen: Date.now(), share: 0.05 },
      { path: '/pricing', provider: 'Anthropic', crawler: 'ClaudeBot', category: 'training', requests: 100, lastSeen: Date.now(), share: 0.0125 },
    ],
  }
}

export function visibility(): AIVisibility {
  return {
    window: win,
    steps: [
      { key: 'crawled', unit: 'requests', value: 7006, prev: 6100, status: 'ok' },
      { key: 'fetched', unit: 'requests', value: 370, prev: 300, status: 'ok' },
      { key: 'cited', unit: 'requests', value: null, prev: null, status: 'no_source' },
      { key: 'visited', unit: 'sessions', value: 10, prev: 8, status: 'ok' },
      { key: 'converted', unit: 'people', value: 2, prev: 1, status: 'ok' },
    ],
    providers: [
      { provider: 'OpenAI', crawled: 5000, fetched: 300, visited: 8, converted: 2 },
      { provider: 'Anthropic', crawled: 2006, fetched: 70, visited: 2, converted: 0 },
      { provider: 'Perplexity', crawled: 0, fetched: 0, visited: 0, converted: null },
    ],
    pages: [
      { path: '/docs', crawled: 400, fetched: 40, visits: 4, conversions: 1, lastCrawled: NOW - 2 * H },
      { path: '/pricing', crawled: 100, fetched: 10, visits: 1, conversions: 0, lastCrawled: NOW - 30 * H },
    ],
    conv: { goalId: 1, name: 'Signup' },
    verifiedShare: 0.82,
  }
}

export function notSetUp(): AIVisibility {
  const v = visibility()
  return {
    ...v,
    steps: v.steps.map((s) => (s.key === 'crawled' || s.key === 'fetched' ? { ...s, value: null, prev: null, status: 'not_set_up' } : s)),
    providers: v.providers.map((p) => ({ ...p, crawled: 0, fetched: 0 })),
    verifiedShare: null,
  }
}

export function agents(): Agents {
  return {
    window: win,
    sessions: 42,
    prevSessions: 30,
    pageviews: 120,
    verifiedSessions: 30,
    conversions: 3,
    conv: { goalId: 1, name: 'Signup' },
    series: [
      { t: 0, verified: 3, claimed: 1 },
      { t: 1, verified: 27, claimed: 11 },
    ],
    agents: [
      { agent: 'claude-agent', name: 'Claude agent', provider: 'Anthropic', sessions: 30, prev: 20, pageviews: 90, verified: 24, lastSeen: NOW - H },
      { agent: 'google-agent', name: 'Google-Agent', provider: 'Google', sessions: 12, prev: 10, pageviews: 30, verified: 6, lastSeen: NOW - 5 * H },
    ],
    pages: [
      { path: '/pricing', pageviews: 60, sessions: 20, topAgent: 'Claude agent' },
      { path: '/docs', pageviews: 30, sessions: 15, topAgent: 'Google-Agent' },
    ],
    latest: [
      { sessionId: 's-a1', person: 'pa1', agent: 'claude-agent', name: 'Claude agent', provider: 'Anthropic', via: 'sig', start: NOW - H, durationMs: 42_000, pages: 3, entry: '/pricing', goals: 1 },
      { sessionId: 's-a2', person: 'pa2', agent: 'google-agent', name: 'Google-Agent', provider: 'Google', via: 'ua', start: NOW - 5 * H, durationMs: 9_000, pages: 1, entry: '/docs', goals: 0 },
    ],
  }
}

export function emptyAgents(): Agents {
  return { ...agents(), sessions: 0, prevSessions: 0, pageviews: 0, verifiedSessions: 0, conversions: 0, series: [], agents: [], pages: [], latest: [] }
}

export function setup(state: AISetup['crawls']['state'] = 'receiving'): AISetup {
  return {
    crawls: { state, lastAt: state === 'none' ? null : NOW - 4 * 60_000, last24h: state === 'receiving' ? 120 : 0 },
    agents: { lastAt: NOW - H, last24h: 5 },
    lists: [
      { name: 'anthropic-sail', kind: 'ip', fetchedAt: NOW - 3 * H, entries: 12, ok: true },
      { name: 'openai-keys', kind: 'keys', fetchedAt: NOW - 3 * H, entries: 2, ok: true },
    ],
  }
}
