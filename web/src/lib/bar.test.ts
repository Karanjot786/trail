import { expect, it } from 'vitest'
import { bar } from './bar'

it('scales by the largest value in the list', () => {
  expect(bar(5, 10)).toBe(0.5)
  expect(bar(3, 0)).toBe(0)
  expect(bar(12, 10)).toBe(1)
})
