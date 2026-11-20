// Numbers: one ridge line of dots. A port of the prototype's drawRidge (main.js 136–147).
// Row 0 is the crest (ink, r 2.4); rows 1..9 fade down the slope (blue, r 1.7). One path per row.
import { makeNoise } from './noise.mjs'
import { dotsPath, svgDoc, n2 } from './svgdot.mjs'

export function renderRidge({ W = 1440, H = 200, seed = 21 } = {}) {
  const nz = makeNoise(seed), step = 10, rows = []
  for (let x = step / 2; x < W; x += step) {
    const top = H * (.18 + .62 * (1 - Math.pow(nz(x / W * 3.2 + 1.3, .4), 1.4)))
    for (let y = top, k = 0; y < H; y += step, k++) {
      const a = Math.max(0, 1 - k * .11) * (k ? .55 : 1)
      if (a <= 0) break
      ;(rows[k] ||= []).push([x, y, k ? 1.7 : 2.4])
    }
  }
  const body = rows.map((dots, k) => {
    const a = n2(Math.max(0, 1 - k * .11) * (k ? .55 : 1))
    return k
      ? `<path class="rg-fill" style="--k:${k}" fill="#0a72ef" fill-opacity="${a}" d="${dotsPath(dots)}"/>`
      : `<path class="rg-crest" fill="#06142e" d="${dotsPath(dots)}"/>`
  }).join('')
  return svgDoc(`0 0 ${W} ${H}`, body, ' preserveAspectRatio="xMidYMax slice" aria-hidden="true"')
}
