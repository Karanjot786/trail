// THE comparison function (plan §0.9). Every delta in the app is computed here and nowhere else.
// Frozen after P0. Port of the prototype's TE.compare, with rates as 0–1 fractions and money in minor units.
//   - fewer than MIN_BASE in the earlier period: counts show the plain difference, never "+700%"
//   - rates, averages and money backed by fewer than MIN_BASE (`n`: sessions, visitors or purchases): "too little data"
//   - money at 0 in this period: "no purchases", never a red "-100%"
//   - rates: the difference in percentage points ("pt", read out as "points")
import type { Basis } from '../api/types'
import { fmtInt } from './format'

export type DeltaKind = 'count' | 'rate' | 'money' | 'duration' // rate: 0–1 fractions
export interface Delta {
  mode: 'pct' | 'abs' | 'pts' | 'low' | 'none' | 'flat'
  text: string // "86%", "7", "5.8 pt", "too little data", "no purchases", "no change", "7 new"
  sign: '+' | '−' | ''
  tone: 'good' | 'bad' | 'flat'
  up: boolean | null
  cur: number | null
  prev: number | null
}

export const MIN_BASE = 5

const finite = (x: number | null): x is number => x != null && Number.isFinite(x)

export function compare(cur: number | null, prev: number | null, kind: DeltaKind, goodWhen: 'up' | 'down' | 'flat', n?: number): Delta {
  const quiet = (mode: Delta['mode'], text: string): Delta => ({ mode, text, sign: '', tone: 'flat', up: null, cur, prev })
  if (!finite(prev)) return quiet('none', 'no earlier data')
  if (!finite(cur)) return quiet('none', 'no data')
  if (kind === 'money' && cur === 0) return quiet('none', 'no purchases')
  if ((kind === 'rate' || kind === 'duration' || kind === 'money') && n != null && n < MIN_BASE) return quiet('low', 'too little data')
  if (cur === 0 && prev === 0) return quiet('flat', 'no change')

  let ch: number
  let mode: Delta['mode']
  let text: string
  if (kind === 'rate') {
    ch = (cur - prev) * 100
    if (Math.abs(ch) < 0.05) ch = 0
    mode = 'pts'
    text = `${Math.abs(ch).toFixed(1).replace(/\.0$/, '')} pt`
  } else if (kind === 'count' && prev < MIN_BASE) {
    ch = Math.round(cur - prev)
    mode = 'abs'
    text = fmtInt(Math.abs(ch)) + (prev === 0 ? ' new' : '')
  } else if (prev === 0) {
    // Money or a duration with nothing earlier: no percentage exists.
    ch = cur
    mode = 'abs'
    text = 'new'
  } else {
    ch = ((cur - prev) / Math.abs(prev)) * 100
    const whole = Math.round(Math.abs(ch)) // round the magnitude: -0.5% and +0.5% both read 1%
    if (whole === 0) ch = 0
    mode = 'pct'
    text = `${fmtInt(whole)}%`
  }
  if (ch === 0) return quiet('flat', 'no change')
  const up = ch > 0
  const tone = goodWhen === 'flat' ? 'flat' : (goodWhen === 'down' ? !up : up) ? 'good' : 'bad'
  return { mode, text, sign: up ? '+' : '−', tone, up, cur, prev }
}

/** The pill text, the screen-reader sentence and the tooltip for a delta, always naming its basis. */
export function deltaLabel(d: Delta, basis: Basis): { pill: string; sr: string; tip: string } {
  const vs = basis.none ? '' : basis.text
  const spoken = d.text.replace(/ pt$/, ' points')
  const directed = d.up != null
  const pill = directed ? `${d.sign}${d.text}` : d.text
  const sr = directed ? `${d.up ? 'up' : 'down'} ${spoken}${vs ? ` ${vs}` : ''}` : `${spoken}${vs ? `, ${vs}` : ''}`
  const why =
    d.mode === 'abs'
      ? d.text === 'new'
        ? '. Nothing in the earlier period, so there is no percentage.'
        : '. Too few to compare as a percentage, so this is the plain difference.'
      : d.mode === 'low'
        ? '. Too little data in the earlier period for a fair change.'
        : ''
  const tip = vs ? vs.charAt(0).toUpperCase() + vs.slice(1) + why : why.replace(/^\. /, '')
  return { pill, sr, tip }
}
