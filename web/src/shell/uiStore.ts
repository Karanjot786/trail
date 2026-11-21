// Shell overlay state: which shell overlay is open, and whether it was opened from the keyboard
// (keyboard-opened ⌘K and ? render with no animation).
import { useSyncExternalStore } from 'react'

export interface ShellUi {
  palette: null | { scope: '' | 'filter'; instant: boolean }
  shortcuts: null | { instant: boolean }
  saveView: boolean
  share: boolean
  addSite: boolean
  drawer: boolean
  collapsed: boolean
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('trail.rail') === '1'
  } catch {
    return false
  }
}

let ui: ShellUi = { palette: null, shortcuts: null, saveView: false, share: false, addSite: false, drawer: false, collapsed: readCollapsed() }
const listeners = new Set<() => void>()

export function setUi(patch: Partial<ShellUi>): void {
  ui = { ...ui, ...patch }
  if ('collapsed' in patch) {
    try {
      localStorage.setItem('trail.rail', patch.collapsed ? '1' : '0')
    } catch {
      /* storage blocked: lasts for this page only */
    }
  }
  listeners.forEach((f) => f())
}
export function getUi(): ShellUi {
  return ui
}
export function useUi(): ShellUi {
  return useSyncExternalStore(
    (f) => (listeners.add(f), () => void listeners.delete(f)),
    () => ui,
    () => ui,
  )
}
export function resetUi(): void {
  ui = { palette: null, shortcuts: null, saveView: false, share: false, addSite: false, drawer: false, collapsed: readCollapsed() }
  listeners.forEach((f) => f())
}
