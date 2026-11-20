// Copy zones the hero art must keep clear, measured from the prototype with rel() (hero-relative boxes):
// desktop at 1440×900 (scaled ×1600/1440 into the 1600×1000 frame), mobile at 390×844 (moved into the
// 390×480 in-flow box, whose top is the prototype's .hero-art-space top at y = 482).
// Boxes are [x, y, w, h] in frame units. The CTA row is the two buttons, not the full-width flex row.
import { openSync } from 'fontkit'

const S = 1600 / 1440
const desk = { h1: [100, 160, 710.4, 224.2], lede: [100, 408.2, 532, 57], ctas: [100, 499.2, 392, 48], nums: [100, 791.1, 581.7, 68.9], legend: [1050, 728, 290, 132] }
export const AVOID_DESKTOP = Object.values(desk).map(([x, y, w, h]) => ({ x: x * S, y: y * S, w: w * S, h: h * S }))

// Mobile: the copy sits above and below the box (the box is 40 px taller than the prototype's 440 px space).
const top = 482.1
export const AVOID_MOBILE = [
  { x: 16, y: 378.1 - top, w: 358, h: 104 },   // .ctas (two rows)
  { x: 16, y: 480, w: 358, h: 167.6 },         // .nums, right under the box
]

// Waypoint chip size (.wp: 13 px Geist Mono label over a 12 px sub, 6/10/7 px padding, 1 px border;
// mobile 11.5/11 px, 5/8 px padding). Width comes from Geist Mono's advance, read from the font.
const mono = openSync(new URL('../../src/assets/fonts/geist-mono-latin-wght-normal.woff2', import.meta.url).pathname)
export const MONO_ADV = mono.layout('0').advanceWidth / mono.unitsPerEm
export const MONO_FILE = new URL('../../src/assets/fonts/geist-mono-latin-wght-normal.woff2', import.meta.url)

export function labelBox(label, sub, mobile = false) {
  const [f1, f2, px, py] = mobile ? [11.5, 11, 8, 5] : [13, 12, 10, 6.5]
  const w = Math.max([...label].length * f1, [...sub].length * f2) * MONO_ADV + px * 2 + 2
  const h = (f1 + f2) * 1.35 + py * 2 + 2
  return { w, h }
}
