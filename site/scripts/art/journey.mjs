// The user_986 journey (K4) and what the hero draws from it.
import { readFileSync } from 'node:fs'

export const JOURNEY_FILE = new URL('../../src/data/journey-user986.json', import.meta.url)

export function loadJourney() {
  return JSON.parse(readFileSync(JOURNEY_FILE, 'utf8'))
}

// Durations as the dashboard shows them: 66 → '1m6s', 4 → '4s'. Same as fmtSec in src/lib/art.ts.
export function fmtSec(sec) {
  const m = Math.floor(sec / 60)
  return m ? `${m}m${sec % 60}s` : `${sec}s`
}

// Visit 1: the source, the two pages, and the goal it reached.
export function heroWaypoints(j) {
  const v = j.visits[0]
  const src = v.steps.find((s) => s.k === 'src')
  const pages = v.steps.filter((s) => s.k === 'page')
  const goal = v.steps.find((s) => s.k === 'ev')
  return [
    { label: src.t, sub: `${v.date}, ${v.time}` },
    ...pages.map((p) => ({ label: p.t, sub: `${fmtSec(p.sec)} ↓${p.scroll}%` })),
    { label: goal.t, sub: `${j.identified ? 'identified ' : ''}${j.id}`, goal: true },
  ]
}

// Footsteps per segment: a short lead-in to the source, then one segment per page sized by its
// engaged time, then a short walk to the goal. Sums to `total`.
export function stepPlan(j, total, lead = 8, tail = 6) {
  const secs = j.visits[0].steps.filter((s) => s.k === 'page').map((p) => p.sec)
  const rest = total - lead - tail, sum = secs.reduce((a, b) => a + b, 0)
  const mid = secs.map((s) => Math.round((rest * s) / sum))
  mid[mid.length - 1] += rest - mid.reduce((a, b) => a + b, 0)
  return [lead, ...mid, tail]
}
