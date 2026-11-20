// STUB (A0): writes placeholder art with the final filenames and K9 viewBoxes, so the site builds
// before builder B's generator lands. B replaces this file (same CLI: [--out <dir>] [--force]).
import { mkdirSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const args = process.argv.slice(2)
const out = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : 'src/generated/art')
mkdirSync(out, { recursive: true })

const svg = (vb, body = '', extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}>${body}</svg>\n`
const dot = (cx, cy, r) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`
const files = {
  'hero-steps.svg': svg('0 0 1600 1000', '<circle class="st" style="--i:1" cx="800" cy="900" r="3"/><circle class="ring" style="--d:330ms" cx="800" cy="800" r="10" fill="none" stroke="#fff" stroke-width="2"/>'),
  'hero-steps-m.svg': svg('0 0 390 480', '<circle class="st" style="--i:1" cx="195" cy="420" r="3"/>'),
  'ridge.svg': svg('0 0 1440 200', '<path class="rg-crest" d="M0,100H1440"/>', ' preserveAspectRatio="xMidYMax slice"'),
  'route-a.svg': svg('0 0 240 420', '<circle class="rt" style="--i:1" cx="20" cy="400" r="3.4"/>'),
  'route-b.svg': svg('0 0 640 300', '<circle class="rt" style="--i:1" cx="620" cy="20" r="3.4"/>'),
  'route-m.svg': svg('0 0 390 120', '<circle class="rt" style="--i:1" cx="195" cy="20" r="3.4"/>'),
  'cta-walk.svg': svg('0 0 640 360', '<circle cx="620" cy="180" r="4"/>'),
  'cta-walk-m.svg': svg('0 0 360 260', '<circle cx="340" cy="20" r="4"/>'),
  // ink starts at x = 0 by contract (the footer test aligns it with the first link)
  'footer-word.svg': svg('0 0 1240 300', `<path class="fw-dots" style="--g:0" fill="#fff" d="${dot(10, 150, 10)}"/><circle class="fw-step" style="--i:0" cx="60" cy="320" r="8" fill="#fff"/>`, ' overflow="visible"'),
  'hero-waypoints.json': JSON.stringify(
    [
      ['google.com', 'Nov 2, 23:50', false],
      ['/docs/components/data-story', '1m6s ↓20%', false],
      ['/docs/components', '1m40s ↓49%', false],
      ['Signup', 'identified user_986', true],
    ].map(([label, sub, goal], i) => ({
      label, sub, goal,
      x: 40 + i * 8, y: 90 - i * 18, r: 1, lx: 42 + i * 8, ly: 88 - i * 18,
      mx: 50, my: 90 - i * 20, mr: 2, mlx: 54, mly: 88 - i * 20,
      delay: 330 + i * 900,
    })),
  ),
}
for (const [f, body] of Object.entries(files)) writeFileSync(join(out, f), body)

const px = () => sharp({ create: { width: 1, height: 1, channels: 3, background: '#0a72ef' } })
for (const f of ['hero-field.avif', 'hero-field@2x.avif', 'hero-field-m.avif']) await px().avif().toFile(join(out, f))
for (const f of ['hero-field.webp', 'hero-field-m.webp']) await px().webp().toFile(join(out, f))

const bytes = Object.fromEntries(readdirSync(out).filter((f) => f !== 'manifest.json').map((f) => [f, statSync(join(out, f)).size]))
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ inputsHash: 'stub', seed: 0, bytes }, null, 2))
console.log(`art (stub): ${Object.keys(bytes).length} files -> ${out}`)
