import { describe, expect, it } from 'vitest'
import { placeCard } from './placeCard'

describe('placeCard', () => {
  it('sits 16 px to the right of the hairline when it fits', () => {
    expect(placeCard(100, 220, 1000)).toEqual({ left: 116, side: 'r' })
  })
  it('flips left near the right edge and never covers the point', () => {
    const p = placeCard(900, 220, 1000)
    expect(p.side).toBe('l')
    expect(p.left + 220).toBeLessThan(900)
  })
  it('stays right when there is no room on either side', () => {
    expect(placeCard(50, 220, 240).side).toBe('r')
  })
  it('honours a custom gap', () => {
    expect(placeCard(100, 50, 1000, 8).left).toBe(108)
  })
})
