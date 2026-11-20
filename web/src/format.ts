import type { Delivery, Metric } from './api'
import { formatRate } from './goals'

const nf = new Intl.NumberFormat('en-US')

export const num = (n: number) => nf.format(Math.round(n))

/** 0–1 fraction → whole percent. */
export const pct = (f: number) => `${Math.round((Number.isFinite(f) ? f : 0) * 100)}%`

/** Relative change from `prev` to `cur`, as a fraction. 0 → n is +100%, 0 → 0 is 0. */
export function change(cur: number, prev: number): number {
  if (prev === 0) return cur === 0 ? 0 : 1
  return (cur - prev) / prev
}

/** Signed whole-percent change label: delta(84, 171) → "-51%". */
export function delta(cur: number, prev: number): string {
  const p = Math.round(change(cur, prev) * 100)
  return p > 0 ? `+${p}%` : `${p}%`
}

export type Tone = 'good' | 'bad' | 'neutral'

/** Badge tone for a change: up is good, except bounce where down is good. */
export function badgeTone(metric: Metric, ch: number): Tone {
  if (Math.round(ch * 100) === 0) return 'neutral'
  const up = ch > 0
  return (metric === 'bounce' ? !up : up) ? 'good' : 'bad'
}

/** Compact duration for journey chips: 130000 → "2m10s", 8000 → "8s". */
export function dur(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m}m${s % 60}s` : `${m}m`
  return `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ''}`
}

/** Header "Delivery health" line: "12,840 events in range · 1.7% arrived on a retry". */
export function deliveryText(d: Partial<Delivery>): string {
  const n = d.events ?? 0
  if (!n) return 'No events in range'
  return `${num(n)} ${n === 1 ? 'event' : 'events'} in range · ${formatRate(d.retriedRate ?? 0)} arrived on a retry`
}
