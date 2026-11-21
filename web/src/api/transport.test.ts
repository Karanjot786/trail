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
