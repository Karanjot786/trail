// Header nav items, shared by the landing (Astro), the docs config and the docs theme (Vue).
import { DEMO_URL } from '../config.ts'

export const NAV = [
  { label: 'How it works', href: '/#how', hideSmall: true },
  { label: 'Docs', href: '/docs/quickstart' },
  { label: 'Numbers', href: '/#numbers', hideSmall: true },
  { label: 'Demo', href: DEMO_URL },
]

// Owner: below this many stars the GitHub button reads "Star" with no count (formatStars returns '').
export const STAR_MIN = 50
