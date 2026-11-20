// Shared runtime helpers. Every story script imports from here.
export const reduceMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
export const EOUT = 'cubic-bezier(.23,1,.32,1)',
  EIO = 'cubic-bezier(.77,0,.175,1)'

// Calls cb once, the first time el is at least `threshold` in view.
export function onView(el: Element, cb: () => void, threshold = 0.18): void {
  const io = new IntersectionObserver(
    (es) => {
      if (!es.some((e) => e.isIntersecting)) return
      io.disconnect()
      cb()
    },
    { threshold },
  )
  io.observe(el)
}

// Marks [data-reveal] and [data-reveal-self] elements with data-inview once they enter view. Idempotent.
export function initReveal(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-reveal],[data-reveal-self]')) {
    if (el.dataset.revealBound != null) continue
    el.dataset.revealBound = ''
    onView(el, () => el.setAttribute('data-inview', 'true'))
  }
}

initReveal()
