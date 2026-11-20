import { describe, expect, it } from 'vitest'
import { formatRate, goalLabel, validateGoal } from './goals'

describe('goals helpers', () => {
  it('formatRate shows one decimal, a floor marker for tiny rates, and plain 0%', () => {
    expect(formatRate(0.1234)).toBe('12.3%')
    expect(formatRate(0)).toBe('0%')
    expect(formatRate(0.0004)).toBe('<0.1%')
    expect(formatRate(1)).toBe('100%')
    expect(formatRate(Number.NaN)).toBe('0%')
  })

  it('goalLabel describes what the goal matches', () => {
    expect(goalLabel({ kind: 'page', match: '/blog/*' })).toBe('Visited /blog/*')
    expect(goalLabel({ kind: 'event', match: 'Signup' })).toBe('Event: Signup')
  })

  it('validateGoal mirrors the server rules', () => {
    expect(validateGoal({ name: 'Signup', kind: 'event', match: 'Signup' })).toEqual({})
    expect(validateGoal({ name: '', kind: 'event', match: 'Signup' }).name).toBeTruthy()
    expect(validateGoal({ name: 'x'.repeat(61), kind: 'event', match: 'a' }).name).toBeTruthy()
    expect(validateGoal({ name: 'ok', kind: 'event', match: '  ' }).match).toBeTruthy()
    expect(validateGoal({ name: 'ok', kind: 'event', match: 'x'.repeat(201) }).match).toBeTruthy()
    expect(validateGoal({ name: 'ok', kind: 'page', match: 'pricing' }).match).toBeTruthy()
    expect(validateGoal({ name: 'ok', kind: 'page', match: '/blog/*' })).toEqual({})
    expect(validateGoal({ name: 'ok', kind: 'page', match: '/a*b' }).match).toBeTruthy()
  })
})
