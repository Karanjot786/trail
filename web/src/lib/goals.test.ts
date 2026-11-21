import { describe, expect, it } from 'vitest'
import { GOAL_MSG, formatRate, goalLabel, goalServerError, validateGoal } from './goals'

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
    expect(validateGoal({ name: '', kind: 'event', match: 'Signup' }).name).toBe(GOAL_MSG.name)
    expect(validateGoal({ name: 'x'.repeat(61), kind: 'event', match: 'a' }).name).toBe(GOAL_MSG.name)
    expect(validateGoal({ name: 'ok', kind: 'event', match: '  ' }).match).toBe(GOAL_MSG.match)
    expect(validateGoal({ name: 'ok', kind: 'event', match: 'x'.repeat(201) }).match).toBe(GOAL_MSG.match)
    expect(validateGoal({ name: 'ok', kind: 'page', match: 'pricing' }).match).toBe(GOAL_MSG.slash)
    expect(validateGoal({ name: 'ok', kind: 'page', match: '/blog/*' })).toEqual({})
    expect(validateGoal({ name: 'ok', kind: 'page', match: '/a*b' }).match).toBe(GOAL_MSG.star)
  })

  it('server errors read exactly like the client checks, under the right field', () => {
    expect(goalServerError('bad goal: name must be 1-60 characters')).toEqual({ name: GOAL_MSG.name })
    expect(goalServerError('bad goal: match must be 1-200 characters')).toEqual({ match: GOAL_MSG.match })
    expect(goalServerError('bad goal: a goal named "Signup" already exists').name).toBe('A goal named "Signup" already exists.')
    expect(goalServerError('bad goal: at most 50 goals per site').match).toBe('At most 50 goals per site.')
  })
})
