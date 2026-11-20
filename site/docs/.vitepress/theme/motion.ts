import type { Router } from 'vitepress'
import { nextTick } from 'vue'

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'

// Fades the doc body in after a route change. Never on first load or on a
// hash-only change, and never on the header or sidebar.
export function installPageEnter(router: Router): void {
  let lastPath = location.pathname
  const prev = router.onAfterRouteChange
  router.onAfterRouteChange = async (to) => {
    await prev?.(to)
    const path = new URL(to, location.href).pathname
    if (path === lastPath) return
    lastPath = path
    await nextTick()
    const el = document.querySelector('.VPDoc .content-container, .VPHome')
    if (!el) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    el.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
      { duration: reduce ? 120 : 180, easing: EASE },
    )
  }
}
