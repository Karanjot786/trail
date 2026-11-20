// Build-time art (K9): turns the user_986 journey into the hero terrain (AVIF/WebP), inline footstep SVGs,
// waypoint positions, the numbers ridge, the journey route, the CTA walk and the footer word.
// Seeded and deterministic. Fails (exit 1) when a file is over its budget.
// CLI: node scripts/art/build.mjs [--out <dir>] [--force]
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderHero } from './hero.mjs'
import { toAvif, toWebp } from './raster.mjs'
import { renderRidge } from './ridge.mjs'
import { renderRoute, renderWalk } from './paths.mjs'
import { renderFooterWord, GEIST_FILE } from './wordmark.mjs'
import { JOURNEY_FILE, loadJourney } from './journey.mjs'
import { MONO_FILE } from './layout.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const SEED = 7

// bytes on disk (raw) or gzip -9 (gz); hero raster + its inline SVG must also fit HERO_ART
export const BUDGETS = {
  'hero-field.avif': { max: 49152 },
  'hero-field@2x.avif': { max: 73728 },
  'hero-field-m.avif': { max: 40960 },
  'hero-field.webp': { max: 92160 },
  'hero-field-m.webp': { max: 61440 },
  'hero-steps.svg': { max: 6144 },
  'hero-steps-m.svg': { max: 5120 },
  'ridge.svg': { max: 6144, gz: true },
  'route-a.svg': { max: 3072 },
  'route-b.svg': { max: 3072 },
  'route-m.svg': { max: 3072 },
  'cta-walk.svg': { max: 3072 },
  'cta-walk-m.svg': { max: 3072 },
  'footer-word.svg': { max: 14336, gz: true },
}
export const HERO_ART = 81920
const PAIRS = [['hero-field@2x.avif', 'hero-steps.svg'], ['hero-field.avif', 'hero-steps.svg'], ['hero-field-m.avif', 'hero-steps-m.svg']]

export function inputsHash() {
  const h = createHash('sha256')
  for (const f of readdirSync(HERE).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).sort()) h.update(f).update(readFileSync(join(HERE, f)))
  for (const u of [JOURNEY_FILE, GEIST_FILE, MONO_FILE]) h.update(readFileSync(u))
  return h.digest('hex')
}

const size = (f, buf) => (BUDGETS[f]?.gz ? gzipSync(buf, { level: 9 }).length : buf.length)

export async function build({ out, force = false, log = console.log } = {}) {
  mkdirSync(out, { recursive: true })
  const hash = inputsHash(), mf = join(out, 'manifest.json')
  if (!force && existsSync(mf)) {
    const m = JSON.parse(readFileSync(mf, 'utf8'))
    if (m.inputsHash === hash && Object.keys(BUDGETS).every((f) => existsSync(join(out, f)))) {
      log(`art: up to date (${hash.slice(0, 12)}) -> ${out}`)
      return m
    }
  }

  const journey = loadJourney()
  const d = renderHero({ W: 1600, H: 1000, mobile: false, seed: SEED, journey })
  const m = renderHero({ W: 390, H: 480, mobile: true, seed: SEED, journey })
  const fw = await renderFooterWord()

  let [a1, a2, am, w1, wm] = await Promise.all([
    toAvif(d.dotsSvg, { width: 1600, height: 1000, quality: 52, budget: BUDGETS['hero-field.avif'].max }),
    toAvif(d.dotsSvg, { width: 2880, height: 1800, quality: 36, budget: BUDGETS['hero-field@2x.avif'].max }),
    toAvif(m.dotsSvg, { width: 780, height: 960, quality: 56, budget: BUDGETS['hero-field-m.avif'].max }),
    toWebp(d.dotsSvg, { width: 1600, height: 1000, quality: 70, budget: BUDGETS['hero-field.webp'].max }),
    toWebp(m.dotsSvg, { width: 780, height: 960, quality: 70, budget: BUDGETS['hero-field-m.webp'].max }),
  ])

  // risk fallback from the plan: if the 1.8× raster cannot fit even at quality 30, ship it at 1.5×
  if (a2.length > BUDGETS['hero-field@2x.avif'].max) {
    log('art: hero-field@2x.avif over budget at quality 30, falling back to 2400×1500')
    a2 = await toAvif(d.dotsSvg, { width: 2400, height: 1500, quality: 40, budget: BUDGETS['hero-field@2x.avif'].max })
  }

  const waypoints = d.waypoints.map((w, i) => {
    const p = m.waypoints[i]
    return { label: w.label, sub: w.sub, goal: w.goal, x: w.x, y: w.y, r: w.r, lx: w.lx, ly: w.ly, mx: p.x, my: p.y, mr: p.r, mlx: p.lx, mly: p.ly, delay: w.delay }
  })

  const files = {
    'hero-field.avif': a1, 'hero-field@2x.avif': a2, 'hero-field-m.avif': am, 'hero-field.webp': w1, 'hero-field-m.webp': wm,
    'hero-steps.svg': d.stepsSvg, 'hero-steps-m.svg': m.stepsSvg,
    'hero-waypoints.json': JSON.stringify(waypoints, null, 2) + '\n',
    'ridge.svg': renderRidge(),
    'route-a.svg': renderRoute('a'), 'route-b.svg': renderRoute('b'), 'route-m.svg': renderRoute('m'),
    'cta-walk.svg': renderWalk(false), 'cta-walk-m.svg': renderWalk(true),
    'footer-word.svg': fw.svg,
  }

  const bytes = {}, fails = []
  for (const [f, body] of Object.entries(files)) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
    writeFileSync(join(out, f), buf)
    bytes[f] = buf.length
    const b = BUDGETS[f]
    if (b && size(f, buf) > b.max) fails.push(`${f}: ${size(f, buf)} B${b.gz ? ' gz' : ''} > ${b.max} B`)
  }
  for (const [r, s] of PAIRS) if (bytes[r] + bytes[s] > HERO_ART) fails.push(`hero art ${r} + ${s}: ${bytes[r] + bytes[s]} B > ${HERO_ART} B`)

  const manifest = { inputsHash: hash, seed: SEED, bytes }
  writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n')
  log(`art: ${Object.keys(bytes).length} files -> ${out}`)
  for (const [f, n] of Object.entries(bytes)) {
    const b = BUDGETS[f]
    log(`  ${f.padEnd(22)} ${String(n).padStart(7)} B${b ? `  ${b.gz ? 'gz ' + size(f, Buffer.from(files[f])) : ''} / ${b.max}` : ''}`)
  }
  if (fails.length) {
    const e = new Error(`art over budget:\n  ${fails.join('\n  ')}`)
    e.manifest = manifest
    throw e
  }
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const out = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : join(HERE, '../../src/generated/art'))
  build({ out, force: args.includes('--force') }).catch((e) => { console.error(e.message); process.exit(1) })
}
