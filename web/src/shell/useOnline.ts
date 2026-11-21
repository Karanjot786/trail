import { useSyncExternalStore } from 'react'

/** The browser's own online / offline events. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener('online', f)
      window.addEventListener('offline', f)
      return () => {
        window.removeEventListener('online', f)
        window.removeEventListener('offline', f)
      }
    },
    () => navigator.onLine !== false,
    () => true,
  )
}
