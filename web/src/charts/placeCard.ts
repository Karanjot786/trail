/**
 * Where the floating chart card goes: `gap` px right of the hairline at `x`, flipped to the left when it
 * would cross the plot's right edge. It never covers `x`; with no room either side it stays right.
 */
export function placeCard(x: number, cardW: number, plotW: number, gap = 16): { left: number; side: 'r' | 'l' } {
  const right = x + gap
  if (right + cardW <= plotW - 2) return { left: right, side: 'r' }
  const left = x - gap - cardW
  return left >= 0 ? { left, side: 'l' } : { left: right, side: 'r' }
}
