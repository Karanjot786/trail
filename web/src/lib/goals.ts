// Goal helpers (moved from src/goals.ts, Task F4-2). The dialog checks use the server's own words,
// so a message reads the same whether the browser or the server caught it.
import type { Goal } from '../api/types'

/** 0–1 conversion rate → "12.3%", "<0.1%" for tiny non-zero rates, "0%" for none. */
export function formatRate(r: number): string {
  if (!Number.isFinite(r) || r <= 0) return '0%'
  if (r < 0.0005) return '<0.1%'
  return `${Number((r * 100).toFixed(1))}%`
}

export function goalLabel(g: Pick<Goal, 'kind' | 'match'>): string {
  return g.kind === 'page' ? `Visited ${g.match}` : `Event: ${g.match}`
}

export type GoalDraft = Pick<Goal, 'name' | 'kind' | 'match'>
export type GoalErrors = Partial<Record<'name' | 'match', string>>

/** The server's messages (internal/query/goals.go), as sentences. */
export const GOAL_MSG = {
  name: 'Name must be 1-60 characters.',
  match: 'Match must be 1-200 characters.',
  slash: 'Paths start with /.',
  star: 'Use * only at the end, like /blog/*.',
} as const

const sentence = (s: string) => {
  const t = s.trim().replace(/\.$/, '')
  return t ? `${t[0].toUpperCase()}${t.slice(1)}.` : ''
}

/** Client-side copy of the server rules, so the dialog can say what's wrong before it submits. */
export function validateGoal(g: GoalDraft): GoalErrors {
  const out: GoalErrors = {}
  const name = g.name.trim()
  const match = g.match.trim()
  if (!name || [...name].length > 60) out.name = GOAL_MSG.name
  if (!match || [...match].length > 200) out.match = GOAL_MSG.match
  else if (g.kind === 'page' && !match.startsWith('/')) out.match = GOAL_MSG.slash
  else if (g.kind === 'page' && match.slice(0, -1).includes('*')) out.match = GOAL_MSG.star
  return out
}

/** A server error ("bad goal: name must be 1-60 characters") → the field it is about, in the same words. */
export function goalServerError(message: string): GoalErrors {
  const m = sentence(message.replace(/^bad (goal|funnel):\s*/i, ''))
  if (/^(name|a goal named|a funnel named)/i.test(m)) return { name: m }
  return { match: m }
}
