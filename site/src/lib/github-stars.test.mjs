import { test } from 'node:test'
import { equal } from 'node:assert/strict'
import { fetchStars, formatStars } from './github-stars.mjs'

test('off → null', async () => equal(await fetchStars({ env: { TRAIL_STARS: 'off' } }), null))
test('override → number', async () => equal(await fetchStars({ env: { TRAIL_STARS: '1234' } }), 1234))
test('403 → null', async () => equal(await fetchStars({ env: {}, fetchImpl: async () => new Response('{}', { status: 403 }) }), null))
test('throw → null', async () => equal(await fetchStars({ env: {}, fetchImpl: async () => { throw new Error('offline') } }), null))
test('timeout → null', async () => equal(await fetchStars({ env: {}, timeoutMs: 20, fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(o.signal.reason))) }), null))
test('bad json → null', async () => equal(await fetchStars({ env: {}, fetchImpl: async () => new Response('nope') }), null))
test('negative → null', async () => equal(await fetchStars({ env: {}, fetchImpl: async () => Response.json({ stargazers_count: -1 }) }), null))
test('ok → count', async () => equal(await fetchStars({ env: {}, fetchImpl: async () => Response.json({ stargazers_count: 87 }) }), 87))
test('format', () => {
  equal(formatStars(null), ''); equal(formatStars(0), ''); equal(formatStars(NaN), ''); equal(formatStars(-3), '')
  equal(formatStars(49), ''); equal(formatStars(50), '50'); equal(formatStars(87), '87'); equal(formatStars(1234), '1.2K')
})
