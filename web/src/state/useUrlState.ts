// URL state hook (plan §0.10, Task F1-2). The router lives in shell/router.ts.
import { useSyncExternalStore } from 'react'
import { current, subscribe } from '../shell/router'
import type { UrlState } from './url'

export { linkTo, navigate, go, invalidRange, type Patch } from '../shell/router'

export function useUrlState(): UrlState {
  return useSyncExternalStore(subscribe, current, current)
}
