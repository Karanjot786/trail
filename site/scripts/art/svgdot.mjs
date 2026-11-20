// Shared SVG helpers: dots merged into one path (each dot is two arcs), numbers trimmed.
export const n1 = (v) => +v.toFixed(1)
export const n2 = (v) => +v.toFixed(2)

// Many dots as one path `d`. Each dot starts with a relative move from where the last one ended,
// which keeps the string short and repetitive (it gzips well).
export function dotsPath(dots) {
  let d = '', px = 0, py = 0
  for (const [cx, cy, r] of dots) {
    const x = n2(cx - r), y = n2(cy), rr = n2(r)
    d += d ? `m${n2(x - px)},${n2(y - py)}` : `M${x},${y}`
    d += `a${rr},${rr} 0 1,0 ${n2(2 * rr)},0a${rr},${rr} 0 1,0 ${n2(-2 * rr)},0`
    px = x; py = y
  }
  return d
}

export const svgDoc = (viewBox, body, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${attrs}>${body}</svg>\n`
