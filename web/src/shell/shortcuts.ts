// Keyboard shortcuts (plan F1-3). Ignored while typing; ⌘K works everywhere.
import { useEffect, useRef } from 'react'
import type { Metric } from '../api/types'
import type { ScreenId } from '../state/url'

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>

/** G then this key goes to the screen. */
export const GO_KEYS: Record<string, ScreenId> = {
  o: 'overview',
  l: 'live',
  a: 'acquisition',
  v: 'activity',
  c: 'conversions',
  m: 'revenue',
  r: 'crawlers',
  s: 'settings',
}
export const METRIC_KEYS: Metric[] = ['visitors', 'pageviews', 'sessions', 'duration', 'bounce', 'conversion', 'revenue']

export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/** The key name for a map lookup: 'mod+k', 'shift+x', 'g o', '?', '[', '1', 'f'. */
export function keyName(e: KeyboardEvent): string {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if ((e.metaKey || e.ctrlKey) && k === 'k') return 'mod+k'
  if (e.shiftKey && k === 'x') return 'shift+x'
  return k
}

const G_WINDOW_MS = 1000

/** Binds a shortcut map to window keydown. Keys: 'mod+k', 'shift+x', 'f', 's', '?', '[', ']', '1'…'7', 'g o' … */
export function useShortcuts(map: ShortcutMap, enabled = true): void {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    if (!enabled) return
    let gAt = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const name = keyName(e)
      if (name === 'mod+k') {
        const f = ref.current['mod+k']
        if (f) {
          e.preventDefault()
          f(e)
        }
        return
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (gAt && Date.now() - gAt < G_WINDOW_MS) {
        gAt = 0
        const f = ref.current[`g ${name}`]
        if (f) {
          e.preventDefault()
          f(e)
          return
        }
      }
      if (name === 'g') {
        gAt = Date.now()
        return
      }
      const f = ref.current[name]
      if (f) {
        e.preventDefault()
        f(e)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

export interface ShellActions {
  share: boolean
  screen: ScreenId
  hasFilters: boolean
  hasRevenue: boolean
  journeyOpen: boolean
  go: (screen: ScreenId) => void
  palette: (scope?: 'filter') => void
  saveView: () => void
  shortcuts: () => void
  toggleRail: () => void
  visit: (step: -1 | 1) => void
  metric: (m: Metric) => void
  clearFilters: () => void
  toggleTheme: () => void
}

/** The shell's shortcut map. In share mode the filter and save shortcuts do nothing. */
export function shellShortcuts(a: ShellActions): ShortcutMap {
  const m: ShortcutMap = {
    '?': () => a.shortcuts(),
    t: () => a.toggleTheme(),
    '[': () => (a.journeyOpen ? a.visit(-1) : a.toggleRail()),
    ']': () => {
      if (a.journeyOpen) a.visit(1)
    },
  }
  for (const [k, screen] of Object.entries(GO_KEYS)) {
    if (a.share && screen === 'settings') continue
    if (screen === 'revenue' && !a.hasRevenue) continue
    m[`g ${k}`] = () => a.go(screen)
  }
  if (a.screen === 'overview') {
    METRIC_KEYS.forEach((metric, i) => {
      if (metric === 'revenue' && !a.hasRevenue) return
      m[String(i + 1)] = () => a.metric(metric)
    })
  }
  if (!a.share) {
    m['mod+k'] = () => a.palette()
    m.f = () => a.palette('filter')
    if (a.screen !== 'settings') m.s = () => a.saveView()
    m['shift+x'] = () => {
      if (a.hasFilters) a.clearFilters()
    }
  }
  return m
}
