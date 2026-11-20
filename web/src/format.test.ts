import { describe, expect, it } from 'vitest'
import { badgeTone, delta, deliveryText, num, pct } from './format'

describe('format', () => {
  it('delta gives a signed rounded percent change', () => {
    expect(delta(84, 171)).toBe('-51%')
    expect(delta(171, 84)).toBe('+104%')
    expect(delta(10, 10)).toBe('0%')
  })

  it('delta from zero is +100% and never Infinity or NaN', () => {
    expect(delta(5, 0)).toBe('+100%')
    expect(delta(0, 0)).toBe('0%')
  })

  it('pct rounds a 0-1 fraction to a whole percent', () => {
    expect(pct(0.7312)).toBe('73%')
    expect(pct(0)).toBe('0%')
  })

  it('num groups thousands', () => {
    expect(num(237)).toBe('237')
    expect(num(12345)).toBe('12,345')
  })

  it('badgeTone: bounce going down is good, visitors going down is bad', () => {
    expect(badgeTone('bounce', -0.11)).toBe('good')
    expect(badgeTone('visitors', -0.51)).toBe('bad')
    expect(badgeTone('pageviews', 0.2)).toBe('good')
    expect(badgeTone('bounce', 0.2)).toBe('bad')
    expect(badgeTone('visitors', 0)).toBe('neutral')
  })

  it('deliveryText summarises delivery health, with a plain line for an empty range', () => {
    expect(deliveryText({ events: 0 })).toBe('No events in range')
    expect(deliveryText({ events: 12840, retried: 218, retriedRate: 0.017 })).toBe('12,840 events in range · 1.7% arrived on a retry')
    expect(deliveryText({ events: 5, retried: 0, retriedRate: 0 })).toBe('5 events in range · 0% arrived on a retry')
    expect(deliveryText({ events: 1, retried: 0, retriedRate: 0 })).toBe('1 event in range · 0% arrived on a retry')
  })
})
