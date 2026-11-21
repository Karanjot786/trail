import { expect, it } from 'vitest'
import { inWindow } from './phrases'

it('names the window in a sentence', () => {
  expect(inWindow({ key: 'today' })).toBe('today')
  expect(inWindow({ key: '30d' })).toBe('in the last 30 days')
  expect(inWindow({ key: 'd:2026-11-12' })).toBe('on Thu, Nov 12')
  expect(inWindow({ key: 'c:2026-11-01~2026-11-05' })).toBe('from Nov 1 to Nov 5')
})
