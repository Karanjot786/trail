// STUB (P0). F1 owns this file (plan §0.10): the one Esc stack. Keep the signature, replace the body.
import { useEffect } from 'react'

/** While `open`, the layer sits on the Esc stack; Esc calls `close` on the top layer only. */
export function useLayer(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
}
