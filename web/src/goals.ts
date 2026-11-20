import type { Goal } from './api'

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

/** Client-side copy of the server rules, so the dialog can say what's wrong before it submits. */
export function validateGoal(g: GoalDraft): Partial<Record<'name' | 'match', string>> {
  const out: Partial<Record<'name' | 'match', string>> = {}
  const name = g.name.trim()
  const match = g.match.trim()
  if (!name) out.name = 'Give the goal a name.'
  else if (name.length > 60) out.name = 'Keep the name under 60 characters.'
  if (!match) out.match = g.kind === 'page' ? 'Enter a path, like /pricing.' : 'Enter the event name.'
  else if (match.length > 200) out.match = 'Keep it under 200 characters.'
  else if (g.kind === 'page' && !match.startsWith('/')) out.match = 'Paths start with /.'
  else if (g.kind === 'page' && match.slice(0, -1).includes('*')) out.match = 'Use * only at the end, like /blog/*.'
  return out
}
