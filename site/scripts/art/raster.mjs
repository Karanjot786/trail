// SVG to AVIF/WebP with sharp. Quality steps down by 4 until the file fits its budget (floor 30).
import sharp from 'sharp'

const render = (svg, width, height) => {
  const w = +/viewBox="0 0 ([\d.]+)/.exec(svg)[1]
  return sharp(Buffer.from(svg), { density: (72 * width) / w, limitInputPixels: false }).resize(width, height, { fit: 'fill' })
}

async function fit(encode, { budget = Infinity, quality = 60, min = 30 }) {
  for (let q = quality; ; q -= 4) {
    const buf = await encode(Math.max(q, min))
    if (buf.length <= budget || q <= min) return { buf, quality: Math.max(q, min) }
  }
}

export async function toAvif(svg, { width, height, quality = 60, budget, min }) {
  const png = await render(svg, width, height).png().toBuffer()
  return (await fit((q) => sharp(png).avif({ quality: q, effort: 6, chromaSubsampling: '4:2:0' }).toBuffer(), { budget, quality, min })).buf
}

export async function toWebp(svg, { width, height, quality = 70, budget, min }) {
  const png = await render(svg, width, height).png().toBuffer()
  return (await fit((q) => sharp(png).webp({ quality: q, effort: 6 }).toBuffer(), { budget, quality, min })).buf
}
