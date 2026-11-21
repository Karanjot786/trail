// STUB (P0). F1 owns this file (plan §0.10): keep the signatures, replace the body.
import { useSyncExternalStore } from 'react'

export interface ToastItem {
  id: number
  msg: string
  tone: 'info' | 'good' | 'bad'
}
let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

export function toast(msg: string, opts: { tone?: ToastItem['tone'] } = {}): void {
  items = [...items, { id: nextId++, msg, tone: opts.tone ?? 'info' }]
  emit()
}

export function Toaster() {
  const list = useSyncExternalStore(
    (f) => (listeners.add(f), () => void listeners.delete(f)),
    () => items,
  )
  return (
    <div role="status" aria-live="polite">
      {list.map((t) => (
        <p key={t.id}>{t.msg}</p>
      ))}
    </div>
  )
}
