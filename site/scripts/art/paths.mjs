// Footstep paths: the Journey route (corner frames) and the CTA walk to the button.
// Ports of the prototype's drawJourneyRoute (main.js 120–133) and drawWalk (150–160), with the section
// geometry measured from the prototype (journey 1440×962 desktop, 390×1549 phone; CTA band 1240×342,
// button at 688,134 171×48 desktop; band 358×475, button at 22,280 159×46 phone).
import { svgDoc, n1, n2 } from './svgdot.mjs'

const qb = (P, s) => {
  const q = 1 - s
  return [q * q * P[0][0] + 2 * q * s * P[1][0] + s * s * P[2][0], q * q * P[0][1] + 2 * q * s * P[1][1] + s * s * P[2][1]]
}

// Journey route. 'a': the bottom-left corner (240×420), 'b': the top-right corner (640×300),
// 'm': the phone's top strip (390×120). Each frame is the section's own corner, so no stretching.
export function renderRoute(kind) {
  const [W, H] = kind === 'm' ? [390, 1549] : [1440, 961.8]
  const F = { a: [240, 420, 0, H - 420], b: [640, 300, W - 640, 0], m: [390, 120, 0, 0] }[kind]
  const [fw, fh, ox, oy] = F
  const [p0, p1, p2, n] = {
    a: [[-10, H * 1.02], [W * .05, H * .82], [W * .14, H * .7], 14],
    b: [[W * .56, H * .33], [W * .78, H * .3], [W * 1.02, H * .06], 26],
    m: [[-20, H * .06], [W * .5, H * .0], [W * 1.1, H * .05], 22],
  }[kind]
  let body = ''
  for (let k = 1; k < n; k++) {
    const s = k / n, q = 1 - s, P = [p0, p1, p2], [x, y] = qb(P, s)
    const dx = 2 * q * (P[1][0] - P[0][0]) + 2 * s * (P[2][0] - P[1][0]), dy = 2 * q * (P[1][1] - P[0][1]) + 2 * s * (P[2][1] - P[1][1]), L = Math.hypot(dx, dy)
    const side = (k % 2 ? 1 : -1) * 6
    body += `<circle class="rt" style="--i:${k}" cx="${n1(x - dy / L * side - ox)}" cy="${n1(y + dx / L * side - oy)}" r="3.4"/>`
  }
  return svgDoc(`0 0 ${fw} ${fh}`, body, ' fill="#fff" fill-opacity=".4" overflow="visible" aria-hidden="true"')
}

// CTA walk. Desktop: the steps come up from the band's bottom-left and stop at the frame's right-middle
// (640,180), which is 26 px left of the button's left edge at its vertical centre.
// Phone: they come in from the band's right edge and stop at the frame's bottom-left corner (0,260),
// 26 px right of the button's right edge at its vertical centre.
export function renderWalk(mobile) {
  const [BW, BH, b] = mobile ? [358, 474.8, { x: 22, y: 280.3, w: 159.3, h: 46 }] : [1240, 341.6, { x: 688, y: 134.4, w: 171.4, h: 48 }]
  const end = mobile ? [b.x + b.w + 26, b.y + b.h / 2] : [b.x - 26, b.y + b.h / 2]
  const start = mobile ? [BW + 10, BH * .2] : [BW * .02, BH + 10], ctl = mobile ? [BW * .95, BH * .7] : [BW * .52, BH * 1.08]
  const [fw, fh, ax, ay] = mobile ? [360, 260, 0, 260] : [640, 360, 640, 180]
  const ox = end[0] - ax, oy = end[1] - ay
  const n = Math.max(14, Math.round(Math.hypot(end[0] - start[0], end[1] - start[1]) / 26))
  let body = ''
  for (let k = 1; k < n; k++) {
    const s = k / n, [x, y] = qb([start, ctl, end], s)
    body += `<circle style="--i:${k}" cx="${n1(x + (k % 2 ? 4 : -4) - ox)}" cy="${n1(y + (k % 2 ? -3 : 3) - oy)}" r="${n2(2.2 + 2.2 * s)}" opacity="${n2(.2 + .6 * s)}"/>`
  }
  return svgDoc(`0 0 ${fw} ${fh}`, body, ' fill="#fff" overflow="visible" aria-hidden="true"')
}
