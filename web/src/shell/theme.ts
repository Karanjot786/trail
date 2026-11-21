// Theme (plan F1-1): dark (Trail black) by default, light is the paper theme.
// Lives in localStorage `trail.theme` and on <html data-theme>, never in the URL.
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'trail.theme'
const listeners = new Set<() => void>()

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function paint(t: Theme, snap: boolean) {
  const root = document.documentElement
  // Suppress transitions during the swap so the page snaps instead of smearing.
  let style: HTMLStyleElement | null = null
  if (snap && document.head) {
    style = document.createElement('style')
    style.textContent = '*,*::before,*::after{transition:none!important}'
    document.head.appendChild(style)
  }
  root.dataset.theme = t
  root.style.colorScheme = t
  if (style) {
    void document.body?.offsetHeight
    requestAnimationFrame(() => style?.remove())
  }
}

/** Runs before the first paint (main.tsx). */
export function applyTheme(): Theme {
  const t = readTheme()
  paint(t, false)
  return t
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* storage blocked: the theme lasts for this page only */
  }
  paint(t, true)
  listeners.forEach((f) => f())
}

export function toggleTheme(): void {
  setTheme(currentTheme() === 'light' ? 'dark' : 'light')
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(
    (f) => (listeners.add(f), () => void listeners.delete(f)),
    currentTheme,
    () => 'dark' as Theme,
  )
  return { theme, setTheme }
}
