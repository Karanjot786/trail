import { describe, expect, it } from 'vitest'
import { apiBase } from './api'

describe('apiBase', () => {
  it('uses the public demo API under /demo and the real API elsewhere', () => {
    expect(apiBase('/demo')).toBe('/api/demo')
    expect(apiBase('/demo/anything')).toBe('/api/demo')
    expect(apiBase('/')).toBe('/api')
    expect(apiBase('/demonstration')).toBe('/api')
  })
})
