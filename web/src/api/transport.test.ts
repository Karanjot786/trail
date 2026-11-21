import { expect, it } from 'vitest'
import { apiBase, fixtureKey } from './transport'

it('fixtureKey is canonical and ignores tz', () => {
  const a = fixtureKey('/stats', new URLSearchParams('site=demo&range=7d&tz=X&f=b:1&f=a:2'))
  const b = fixtureKey('/stats', new URLSearchParams('f=a:2&tz=Y&range=7d&f=b:1&site=demo'))
  expect(a).toBe(b)
  expect(a).not.toContain('tz')
  expect(a).toBe('/stats?f=a%3A2&f=b%3A1&range=7d&site=demo')
})

it('apiBase follows the url prefix', () => {
  expect(apiBase('/')).toBe('/api')
  expect(apiBase('/demo/live')).toBe('/api/demo')
  expect(apiBase('/demonstration')).toBe('/api')
  expect(apiBase('/share/shr_abc/revenue')).toBe('/api/share/shr_abc')
})

// The shared vector: internal/query/fixturekey_test.go asserts the same string from Go.
it('fixtureKey matches the Go recorder vector', () => {
  const p = new URLSearchParams('site=demo&tz=X')
  p.append('range', 'c:2026-11-01~2026-11-05')
  p.append('f', 'path:/a*b é')
  p.append('f', 'country:IN')
  p.append('q', 'a+b&c')
  expect(fixtureKey('/stats', p)).toBe('/stats?f=country%3AIN&f=path%3A%2Fa*b+%C3%A9&q=a%2Bb%26c&range=c%3A2026-11-01%7E2026-11-05&site=demo')
})
