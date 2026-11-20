// Typed loader for the generated art (K9). A0 ships it over the stub outputs; builder B owns it from B1 on.
import avif1x from '../generated/art/hero-field.avif?url'
import avif2x from '../generated/art/hero-field@2x.avif?url'
import webp from '../generated/art/hero-field.webp?url'
import avifM from '../generated/art/hero-field-m.avif?url'
import webpM from '../generated/art/hero-field-m.webp?url'
import heroSteps from '../generated/art/hero-steps.svg?raw'
import heroStepsM from '../generated/art/hero-steps-m.svg?raw'
import ridge from '../generated/art/ridge.svg?raw'
import routeA from '../generated/art/route-a.svg?raw'
import routeB from '../generated/art/route-b.svg?raw'
import routeM from '../generated/art/route-m.svg?raw'
import ctaWalk from '../generated/art/cta-walk.svg?raw'
import ctaWalkM from '../generated/art/cta-walk-m.svg?raw'
import footerWord from '../generated/art/footer-word.svg?raw'
import wps from '../generated/art/hero-waypoints.json'

export type Waypoint = {
  label: string; sub: string; goal: boolean
  x: number; y: number; r: number; lx: number; ly: number // % of the 1600×1000 box: footprint centre, ring radius, label top-left
  mx: number; my: number; mr: number; mlx: number; mly: number // same in the 390×480 mobile box
  delay: number // ms, the ring and label entrance
}

export const heroField = { avif1x, avif2x, webp, avifM, webpM }
export const svg = { heroSteps, heroStepsM, ridge, routeA, routeB, routeM, ctaWalk, ctaWalkM, footerWord }
export const waypoints: Waypoint[] = wps

// Durations as the dashboard shows them: 66 → '1m6s', 4 → '4s', 118 → '1m58s'.
export function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60)
  return m ? `${m}m${sec % 60}s` : `${sec}s`
}
