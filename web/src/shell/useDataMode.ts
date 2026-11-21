// useDataMode (plan §0.13): the one place a component may learn whether data is live (`http`) or recorded
// (`fixtures`), and whether the current view fell back to a preset. The fixtures transport writes here.
import { useSyncExternalStore } from 'react'
import { dataMode } from '../api/transport'

interface Store {
  /** The URL (path + query) whose requests needed a fallback, with what was shown instead. */
  presetUrl: string | null
  presetLabel: string
  recordedAt: number | null
}
let store: Store = { presetUrl: null, presetLabel: '', recordedAt: null }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())
const here = () => (typeof location === 'undefined' ? '' : location.pathname + location.search)

export function markPreset(label: string): void {
  const url = here()
  if (store.presetUrl === url && store.presetLabel === label) return
  store = { ...store, presetUrl: url, presetLabel: label }
  emit()
}
export function setRecordedAt(ms: number | null): void {
  if (store.recordedAt === ms) return
  store = { ...store, recordedAt: ms }
  emit()
}

export interface DataMode {
  mode: 'http' | 'fixtures'
  /** The current view is not recorded; a nearby preset is shown instead. */
  preset: boolean
  presetLabel: string
  recordedAt: number | null
}

export function useDataMode(): DataMode {
  const s = useSyncExternalStore(
    (f) => {
      listeners.add(f)
      window.addEventListener('popstate', f)
      return () => {
        listeners.delete(f)
        window.removeEventListener('popstate', f)
      }
    },
    () => store,
    () => store,
  )
  return { mode: dataMode(), preset: s.presetUrl != null && s.presetUrl === here(), presetLabel: s.presetLabel, recordedAt: s.recordedAt }
}
