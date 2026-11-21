// URL state hook (plan §0.10, Task F1-2). The router lives in shell/router.ts.
import { useSyncExternalStore } from 'react'
import { current, navigate, subscribe } from '../shell/router'
import { SUBTABS, type UrlState } from './url'

export { linkTo, navigate, go, invalidRange, type Patch } from '../shell/router'

export function useUrlState(): UrlState {
  return useSyncExternalStore(subscribe, current, current)
}

/** A screen sub-view kept in the URL (url.ts SUBTABS): its value, and a setter that pushes a history entry. */
export function useSubTab<T extends string>(key: keyof typeof SUBTABS & string): [T, (v: T) => void] {
  const s = useUrlState()
  const value = (s.panels[key] ?? SUBTABS[key][0]) as T
  return [value, (v: T) => navigate({ panels: { ...s.panels, [key]: v } })]
}
