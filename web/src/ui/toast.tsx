// toast() and <Toaster/> (plan §0.10). Rises 8 px and fades in; leaves faster than it arrives.
import { useSyncExternalStore } from 'react'
import { Check, Info, TriangleAlert } from 'lucide-react'
import { Kbd } from './small'

export interface ToastItem {
  id: number
  msg: string
  tone: 'info' | 'good' | 'bad'
  kbd?: string
  leaving?: boolean
}
let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

export function toast(msg: string, opts: { tone?: ToastItem['tone']; kbd?: string; ms?: number } = {}): void {
  const id = nextId++
  items = [...items.slice(-2), { id, msg, tone: opts.tone ?? 'info', kbd: opts.kbd }]
  emit()
  setTimeout(() => {
    items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    emit()
    setTimeout(() => {
      items = items.filter((t) => t.id !== id)
      emit()
    }, 120)
  }, opts.ms ?? 2600)
}

const ICON = { info: Info, good: Check, bad: TriangleAlert }

export function Toaster() {
  const list = useSyncExternalStore(
    (f) => (listeners.add(f), () => void listeners.delete(f)),
    () => items,
    () => items,
  )
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => {
        const Icon = ICON[t.tone]
        return (
          <p key={t.id} className="toast" data-tone={t.tone} data-leaving={t.leaving ? '' : undefined}>
            <Icon size={16} aria-hidden="true" />
            {t.msg}
            {t.kbd && <Kbd>{t.kbd}</Kbd>}
          </p>
        )
      })}
    </div>
  )
}
