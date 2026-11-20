// Footer: "Trail" set in the dot field. Replaces the prototype's drawFooter (main.js 163–181): the word is
// laid out from the Geist file (wght 680) with fontkit, rasterised alone with sharp, then sampled on a
// dot lattice. Ink starts at x = 0 (the left edge of the first dot) and spans the full width.
import { openVariable } from './fontvar.mjs'
import sharp from 'sharp'
import { rng } from './noise.mjs'
import { dotsPath, svgDoc, n1, n2 } from './svgdot.mjs'

export const GEIST_FILE = new URL('../../src/assets/fonts/geist-latin-wght-normal.woff2', import.meta.url)

export async function renderFooterWord({ width = 1240, fontFile = GEIST_FILE.pathname, wght = 680, groups = 12, seed = 3 } = {}) {
  const font = openVariable(fontFile, { wght })
  const run = font.layout('Trail')
  // one path for the run, in font units (y up)
  let x = 0, d = ''
  const T = { x0: 0, x1: 0 }
  run.glyphs.forEach((g, i) => {
    const p = run.positions[i], gp = g.path.translate(x + p.xOffset, p.yOffset)
    if (i === 0) { T.x0 = gp.bbox.minX; T.x1 = gp.bbox.maxX; T.adv = p.xAdvance }
    d += gp.toSVG()
    x += p.xAdvance
  })
  const ink = (() => { let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9; let cx = 0
    run.glyphs.forEach((g, i) => { const b = g.path.translate(cx + run.positions[i].xOffset, 0).bbox; minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX); minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY); cx += run.positions[i].xAdvance })
    return { minX, minY, maxX, maxY } })()
  const s = width / (ink.maxX - ink.minX)
  const gs = width / 160, rOn = gs * .36, rOff = gs * .1
  // lattice: columns at rOn + i*gs (so the first dot's left edge is x = 0), rows at gs/2 + j*gs
  const top = gs * .5                                   // ink top sits half a cell under the frame top
  const inkH = (ink.maxY - ink.minY) * s
  const rowsN = Math.ceil((top + inkH) / gs) + 1, H = Math.round(rowsN * gs)
  const tx = -ink.minX * s, ty = top + ink.maxY * s    // font (0,0) → svg (tx,ty); baseline at y = ty
  const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}"><path transform="translate(${tx},${ty}) scale(${s},${-s})" d="${d}"/></svg>`
  const { data, info } = await sharp(Buffer.from(mask)).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true })
  const on = (px, py) => { const ix = Math.min(info.width - 1, Math.round(px)), iy = Math.min(info.height - 1, Math.round(py)); return data[iy * info.width + ix] > 128 }

  const r = rng(seed), bins = Array.from({ length: groups }, () => [])
  for (let j = 0; j < rowsN; j++) for (let i = 0; i < 160; i++) {
    const cx = rOn + i * gs, cy = gs / 2 + j * gs
    if (cy < H && on(cx, cy)) bins[Math.floor(r() * groups)].push([cx, cy, rOn])
  }
  // under the T's stem the dots keep walking off the page: five steps, each a disc of lattice dots
  const tW = T.adv * s, sx = (T.x0 + T.x1) / 2 * s + tx, R = tW * .085
  const fieldH = Math.ceil((ty + R * 1.7 + 4 * R * 2.4 + R) / gs + 2) * gs   // the field runs on under the steps
  // each step is a circle filled with its own pattern: the lattice dots whose centres fall inside the disc,
  // drawn whole (the circle is one dot radius larger, so no dot is cut at the edge)
  let stepDefs = ''
  const steps = [1, .82, .66, .52, .4].map((k, i) => {
    const cy = ty + R * 1.7 + i * R * 2.4, rr = R * k, R2 = rr + rOn
    let dots = ''
    for (let j = Math.floor((cy - rr) / gs); j <= Math.ceil((cy + rr) / gs); j++) for (let c = Math.floor((sx - rr) / gs); c <= Math.ceil((sx + rr) / gs); c++) {
      const px = rOn + c * gs, py = gs / 2 + j * gs
      if ((px - sx) ** 2 + (py - cy) ** 2 <= rr * rr) dots += `<circle cx="${n2(px - sx + R2)}" cy="${n2(py - cy + R2)}" r="${n2(rOn)}"/>`
    }
    stepDefs += `<pattern id="fw-s${i}" patternUnits="userSpaceOnUse" x="${n2(sx - R2)}" y="${n2(cy - R2)}" width="${n2(2 * R2)}" height="${n2(2 * R2)}"><g fill="#fff">${dots}</g></pattern>`
    return `<circle class="fw-step" style="--i:${i}" cx="${n2(sx)}" cy="${n2(cy)}" r="${n2(R2)}" fill="url(#fw-s${i})"/>`
  }).join('')

  const pat = (id, rr) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${n2(gs)}" height="${n2(gs)}"><circle cx="${n2(rOn)}" cy="${n2(gs / 2)}" r="${n2(rr)}" fill="#fff"/></pattern>`
  const body = `<defs>${pat('fw-bg', rOff)}${stepDefs}</defs>`
    + `<rect class="fw-field" x="-2000" y="0" width="5240" height="${n1(fieldH)}" fill="url(#fw-bg)" opacity=".2"/>`
    + bins.map((b, g) => `<path class="fw-dots" style="--g:${g}" fill="#fff" d="${dotsPath(b)}"/>`).join('')
    + steps
  return { svg: svgDoc(`0 0 ${width} ${H}`, body, ' overflow="visible" aria-hidden="true"'), H, gs }
}
