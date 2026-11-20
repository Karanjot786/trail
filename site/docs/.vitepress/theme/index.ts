import type { Theme } from 'vitepress'
import { inBrowser } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '../../../src/styles/tokens.css'
import '../../../src/styles/chrome.css'
import './styles/vars.css'
import './styles/base.css'
import './styles/doc.css'
import './styles/code.css'
import './styles/motion.css'
import Layout from './Layout.vue'
import { installPageEnter } from './motion'
import { isDocsPath } from '../site'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ router }) {
    if (!inBrowser) return
    // The VitePress router takes every same-origin HTML link, including the
    // landing page and the demo. Send anything outside /docs/ to the browser.
    const prev = router.onBeforeRouteChange
    router.onBeforeRouteChange = (to) => {
      if (!isDocsPath(new URL(to, location.href).pathname)) {
        location.assign(to)
        return false
      }
      return prev?.(to)
    }
    installPageEnter(router)
    // Code copy buttons: VitePress shows the check for 2s; bring it back after 1.5s.
    addEventListener('click', (e) => {
      const btn = (e.target as Element).closest?.('.vp-doc button.copy')
      if (btn) setTimeout(() => btn.classList.remove('copied'), 1500)
    })
  },
} satisfies Theme
