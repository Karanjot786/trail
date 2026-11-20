// A variable WOFF2 font at a given instance, for build-time glyph outlines.
// fontkit 2.0.4 cannot do this alone: getVariation() drops the WOFF2 tables, and pre-decoded WOFF2 glyphs
// skip gvar. So we set the instance coords on the font, decode the glyf table without phantom points,
// then apply gvar deltas to each simple glyph (with its four phantom points) the first time it is read.
import { openSync } from 'fontkit'

export function openVariable(file, settings) {
  const font = openSync(file)
  font.variationCoords = font.fvar.axis.map((a) => settings[a.axisTag.trim()] ?? a.defaultValue)
  Object.prototype._getPhantomPoints = () => []   // composites are decoded with a bare `this` in fontkit
  try { font._transformGlyfTable() } finally { delete Object.prototype._getPhantomPoints }
  const done = new Set(), hm = font.hmtx
  const glyph0 = font.getGlyph(0), orig = glyph0._decode
  const decode = function () {
    const g = orig.call(this)
    if (g && g.numberOfContours > 0 && !done.has(this.id)) {
      done.add(this.id)
      const m = hm.metrics.get(Math.min(this.id, hm.metrics.length - 1))
      const lsb = this.id < hm.metrics.length ? m.bearing : hm.bearings.get(this.id - hm.metrics.length)
      const xMin = Math.min(...g.points.map((p) => p.x)), P = g.points[0].constructor
      const phantom = [new P(false, true, xMin - lsb, 0), new P(false, true, xMin - lsb + m.advance, 0), new P(false, true, 0, 0), new P(false, true, 0, 0)]
      font._variationProcessor.transformPoints(this.id, [...g.points, ...phantom])
    }
    return g
  }
  const getGlyph = font.getGlyph.bind(font)
  font.getGlyph = (id, chars) => { const gl = getGlyph(id, chars); if (gl && gl._decode !== decode) gl._decode = decode; return gl }
  return font
}
