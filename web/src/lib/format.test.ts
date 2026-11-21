import { describe, expect, it } from 'vitest'
import { fmtDay, fmtDur, fmtInt, fmtMoney, fmtPct, fmtRange } from './format'

describe('format', () => {
  it('fmtDur', () => {
    expect(fmtDur(65000)).toBe('1m 05s')
    expect(fmtDur(0)).toBe('0s')
    expect(fmtDur(42_000)).toBe('42s')
    expect(fmtDur(3_725_000)).toBe('1h 02m')
  })
  it('fmtMoney', () => {
    expect(fmtMoney(1900, 'USD')).toBe('$19')
    expect(fmtMoney(1950, 'USD')).toBe('$19.50')
    expect(fmtMoney(500, 'JPY')).toBe('¥500')
  })
  it('fmtPct', () => expect(fmtPct(0.4567)).toBe('46%'))
  it('fmtInt', () => expect(fmtInt(12345)).toBe('12,345'))
  it('fmtDay', () => expect(fmtDay(Date.UTC(2026, 10, 12, 6), 'Asia/Kolkata')).toBe('Thu, Nov 12'))
  it('fmtRange', () => {
    expect(fmtRange(Date.UTC(2026, 10, 9, 6), Date.UTC(2026, 10, 13, 6), 'UTC')).toBe('Nov 9 – Nov 13')
    expect(fmtRange(Date.UTC(2026, 10, 9, 6), Date.UTC(2026, 10, 9, 9), 'UTC')).toBe('Nov 9')
  })
  it('never prints NaN', () => {
    expect(fmtInt(NaN)).toBe('0')
    expect(fmtDur(NaN)).toBe('0s')
    expect(fmtPct(Infinity)).toBe('0%')
  })
})
