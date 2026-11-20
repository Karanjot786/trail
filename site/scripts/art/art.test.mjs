// Generator tests: determinism, budgets, data-true footsteps, waypoint placement, footer word geometry.
// Each run builds into a fresh temp dir through the real CLI.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { AVOID_DESKTOP, labelBox } from './layout.mjs'
import { stepPlan, loadJourney, heroWaypoints } from './journey.mjs'

const CLI = fileURLToPath(new URL('./build.mjs', import.meta.url))
const run = () => { const out = mkdtempSync(join(tmpdir(), 'trail-art-')); execFileSync(process.execPath, [CLI, '--out', out, '--force'], { stdio: 'pipe' }); return out }
let A, B
const read = (f, dir = A) => readFileSync(join(dir, f))
const text = (f, dir = A) => read(f, dir).toString('utf8')
const gz = (f) => gzipSync(read(f), { level: 9 }).length
const pixels = async (buf) => createHash('sha256').update(await sharp(buf).raw().toBuffer()).digest('hex')
const circles = (svg, cls) => [...svg.matchAll(new RegExp(`<circle class="${cls}"[^>]*>`, 'g'))].map(([c]) => {
  const at = (k) => +(new RegExp(`\\b${k}="([^"]+)"`).exec(c)?.[1])
  return { cx: at('cx'), cy: at('cy'), r: at('r'), i: +(/--i:(\d+)/.exec(c)?.[1]), d: parseInt(/--d:(\d+)/.exec(c)?.[1]) }
})

before(() => { A = run(); B = run() })

test('deterministic', async () => {
  for (const f of readdirSync(A)) {
    if (f.endsWith('.svg') || f.endsWith('.json')) assert.equal(text(f), text(f, B), f)
    else assert.equal(await pixels(read(f)), await pixels(read(f, B)), f)
  }
})

test('hero budgets', () => {
  const n = (f) => read(f).length
  assert.ok(n('hero-field@2x.avif') <= 73728, `2x ${n('hero-field@2x.avif')}`)
  assert.ok(n('hero-field.avif') <= 49152, `1x ${n('hero-field.avif')}`)
  assert.ok(n('hero-field-m.avif') <= 40960, `m ${n('hero-field-m.avif')}`)
  assert.ok(n('hero-steps.svg') <= 6144)
  assert.ok(n('hero-steps-m.svg') <= 5120)
  assert.ok(n('hero-field@2x.avif') + n('hero-steps.svg') <= 81920)
  assert.ok(n('hero-field-m.avif') + n('hero-steps-m.svg') <= 81920)
  assert.ok(circles(text('hero-steps.svg'), 'st').length <= 70)
  assert.equal(circles(text('hero-steps.svg'), '(?:ring|ring goal)').length, 4)
  assert.equal(circles(text('hero-steps.svg'), 'ring core').length, 1)
})

test('data-true footsteps', () => {
  for (const f of ['hero-steps.svg', 'hero-steps-m.svg']) {
    const svg = text(f), ring = circles(svg, '(?:ring|ring goal)').map((r) => (r.d - 330) / 38), st = circles(svg, 'st')
    const between = (a, b) => st.filter((s) => s.i > ring[a] && s.i < ring[b]).length
    const n1 = between(0, 1), n2 = between(1, 2)
    assert.ok(Math.abs(n1 - ((n1 + n2) * 66) / 166) <= 1, `${f}: ${n1} vs ${n2} steps`)
  }
  assert.deepEqual(stepPlan(loadJourney(), 60), [8, 18, 28, 6])
})

test('no canvas', () => {
  for (const f of readdirSync(A).filter((f) => !f.endsWith('.avif') && !f.endsWith('.webp'))) assert.ok(!/canvas/i.test(text(f)), f)
})

test('waypoints', () => {
  const wps = JSON.parse(text('hero-waypoints.json'))
  assert.equal(wps.length, 4)
  assert.deepEqual(wps.map((w) => w.goal), [false, false, false, true])
  assert.deepEqual(wps.map(({ label, sub }) => ({ label, sub })), heroWaypoints(loadJourney()).map(({ label, sub }) => ({ label, sub })))
  for (const w of wps) for (const k of ['x', 'y', 'r', 'lx', 'ly', 'mx', 'my', 'mr', 'mlx', 'mly']) assert.ok(w[k] >= 0 && w[k] <= 100, `${w.label}.${k} = ${w[k]}`)
  for (const w of wps) {
    const { w: lw, h: lh } = labelBox(w.label, w.sub), x = (w.lx / 100) * 1600, y = (w.ly / 100) * 1000
    for (const r of AVOID_DESKTOP) assert.ok(!(x < r.x + r.w && x + lw > r.x && y < r.y + r.h && y + lh > r.y), `${w.label} label hits copy`)
  }
})

test('footer word geometry', () => {
  const svg = text('footer-word.svg')
  assert.match(svg, /viewBox="0 0 1240 \d+(\.\d+)?"/)
  const paths = [...svg.matchAll(/<path class="fw-dots" style="--g:(\d+)"[^>]* d="([^"]+)"/g)]
  assert.equal(paths.length, 12)
  assert.deepEqual(paths.map((p) => +p[1]), [...Array(12).keys()])
  // each dot is "M|m x,y a r,r ..." where x = cx - r (absolute after summing relative moves)
  let minL = Infinity, maxR = -Infinity
  for (const [, , d] of paths) {
    let px = 0
    for (const [, cmd, x, r] of d.matchAll(/([Mm])(-?[\d.]+),-?[\d.]+a([\d.]+)/g)) {
      px = cmd === 'M' ? +x : px + +x
      minL = Math.min(minL, px); maxR = Math.max(maxR, px + 2 * +r)
    }
  }
  assert.ok(minL >= 0 && minL <= 0.5, `ink left ${minL}`)
  assert.ok(maxR <= 1240, `ink right ${maxR}`)
  assert.equal(circles(svg, 'fw-step').length, 5)
  assert.deepEqual(circles(svg, 'fw-step').map((c) => c.i), [0, 1, 2, 3, 4])
})

test('secondary budgets', () => {
  assert.ok(gz('footer-word.svg') <= 14336, `footer ${gz('footer-word.svg')}`)
  assert.ok(gz('ridge.svg') <= 6144, `ridge ${gz('ridge.svg')}`)
  for (const f of ['route-a.svg', 'route-b.svg', 'route-m.svg', 'cta-walk.svg', 'cta-walk-m.svg']) assert.ok(read(f).length <= 3072, f)
  const ridge = text('ridge.svg')
  assert.equal((ridge.match(/class="rg-crest"/g) || []).length, 1)
  assert.equal((ridge.match(/class="rg-fill"/g) || []).length, 9)
  assert.match(ridge, /viewBox="0 0 1440 200" preserveAspectRatio="xMidYMax slice"/)
  for (const [f, vb] of [['route-a.svg', '0 0 240 420'], ['route-b.svg', '0 0 640 300'], ['route-m.svg', '0 0 390 120'], ['cta-walk.svg', '0 0 640 360'], ['cta-walk-m.svg', '0 0 360 260']]) assert.ok(text(f).includes(`viewBox="${vb}"`), f)
  assert.ok(circles(text('route-b.svg'), 'rt').length > 0)
})
