// The one Esc stack (plan §0.10, Task F1-3). Every overlay (sheet, dialog, menu, popover, palette, drawer)
// registers while open. One capture-phase Escape handler closes only the top layer. With no layer open,
// Esc does nothing: it never clears filters.
import { useEffect, useRef } from 'react'

interface Layer {
  id: number
  close: () => void
}
const stack: Layer[] = []
let nextId = 1
let installed = false

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  e.stopPropagation()
  top.close()
}

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('keydown', onKey, true)
}

/** Imperative form, for code outside React. Returns the remover. */
export function pushLayer(close: () => void): () => void {
  install()
  const layer = { id: nextId++, close }
  stack.push(layer)
  return () => {
    const i = stack.indexOf(layer)
    if (i >= 0) stack.splice(i, 1)
  }
}

export function layerCount(): number {
  return stack.length
}

/** While `open`, the layer sits on the Esc stack; Esc calls `close` on the top layer only. */
export function useLayer(open: boolean, close: () => void): void {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    if (!open) return
    return pushLayer(() => ref.current())
  }, [open])
}
