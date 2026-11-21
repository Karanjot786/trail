// Fixture drift check (plan T-6).
//  1. `trail demo record` twice with a pinned --now into two temp dirs; the two recordings must be byte-identical
//     (determinism), so a diff against the committed or CI recording means real drift.
//  2. Every recorded body is validated against its §0.5 TypeScript type: required keys come from src/api/types.ts.
//  3. The size caps from §0.13 hold (25 MB on disk, 4 MB gzip).
// Usage: node scripts/fixtures-check.mjs [--now 2026-11-20T04:35:00Z] [--keep]
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const web = resolve(here, '..')
const repo = resolve(web, '..')
const args = process.argv.slice(2)
const nowArg = args.includes('--now') ? args[args.indexOf('--now') + 1] : '2026-11-20T04:35:00Z'

const types = readFileSync(join(web, 'src/api/types.ts'), 'utf8')

function requiredKeys(name, seen = new Set()) {
  if (seen.has(name)) return []
  seen.add(name)
  const m = new RegExp(`export interface ${name}(?:\\s+extends\\s+([\\w, ]+))?\\s*\\{`).exec(types)
  if (!m) return []
  const keys = []
  for (const parent of (m[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)) keys.push(...requiredKeys(parent, seen))
  let depth = 0
  let seg = ''
  const flush = () => {
    const k = /^\s*(\w+)(\??):/.exec(seg)
    if (k && !k[2]) keys.push(k[1])
    seg = ''
  }
  for (let i = m.index + m[0].length; i < types.length; i++) {
    const ch = types[i]
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') {
      if (depth === 0) break
      depth--
    }
    if (depth === 0 && (ch === '\n' || ch === ';')) flush()
    else seg += ch
  }
  flush()
  return [...new Set(keys)]
}

// route path (without /api) -> [type, isArray]
const ROUTES = [
  [/^\/sites\/summary$/, 'SiteSummary', true], [/^\/sites\/[^/]+\/status$/, 'SiteStatus', false], [/^\/sites$/, 'Site', true],
  [/^\/stats$/, 'Stats', false], [/^\/series$/, 'Series', false], [/^\/breakdown$/, 'Row', true], [/^\/changes$/, 'Changes', false],
  [/^\/heatmap$/, 'Heatmap', false], [/^\/live$/, 'Live', false], [/^\/visitors$/, 'Person', true], [/^\/sessions$/, 'SessionRow', true],
  [/^\/journey$/, 'JourneySession', true], [/^\/campaigns$/, 'Campaign', true], [/^\/ai-referrals$/, 'AIReferral', true],
  [/^\/events$/, 'EventRow', true], [/^\/events\/detail$/, 'EventDetail', false], [/^\/goals$/, 'Goal', true],
  [/^\/goals\/report$/, 'GoalRow', true], [/^\/goals\/[^/]+\/detail$/, 'GoalDetail', false], [/^\/paths$/, 'PathsReport', false],
  [/^\/funnels$/, 'Funnel', true], [/^\/funnels\/[^/]+\/report$/, 'FunnelReport', false], [/^\/funnels\/[^/]+\/dropoff$/, 'DropoffPerson', true],
  [/^\/revenue$/, 'Revenue', false], [/^\/revenue\/breakdown$/, 'RevenueRow', true], [/^\/crawlers$/, 'Crawlers', false],
  [/^\/views$/, 'SavedView', true], [/^\/notes$/, 'Note', true],
]

function record(out) {
  execFileSync('go', ['run', './cmd/trail', 'demo', 'record', '--out', out, '--now', nowArg, '--plan', 'testdata/fixtures/plan.json'], { cwd: repo, stdio: 'inherit' })
}
function files(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)]))
}

const a = mkdtempSync(join(tmpdir(), 'trail-fx-a-'))
const b = mkdtempSync(join(tmpdir(), 'trail-fx-b-'))
const failures = []
try {
  record(a)
  record(b)

  const fa = files(a).sort()
  const fb = files(b).sort()
  if (fa.join('\n') !== fb.join('\n')) failures.push('the two recordings produced different file sets')
  for (const f of fa) if (fb.includes(f) && !readFileSync(join(a, f)).equals(readFileSync(join(b, f)))) failures.push(`not deterministic: ${f}`)

  const indexPath = join(a, 'index.json')
  if (!existsSync(indexPath)) throw new Error('index.json is missing from the recording')
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  for (const k of ['recordedAt', 'now', 'tz', 'keys']) if (!(k in index)) failures.push(`index.json lacks "${k}"`)

  let checked = 0
  for (const [key, file] of Object.entries(index.keys ?? {})) {
    const path = key.split('?')[0].replace(/^\/api(?=\/)/, '')
    const hit = ROUTES.find(([re]) => re.test(path))
    const full = join(a, `${file}`.endsWith('.json') ? `${file}` : `${file}.json`)
    if (!existsSync(full)) {
      failures.push(`${key}: file ${file} is missing`)
      continue
    }
    if (!hit) continue // routes without a typed body (for example lists of scalars)
    const [, type, isArray] = hit
    let body = JSON.parse(readFileSync(full, 'utf8'))
    if (body && typeof body === 'object' && 'body' in body && 'status' in body) body = body.body
    const sample = isArray ? (Array.isArray(body) ? body[0] : undefined) : body
    if (isArray && !Array.isArray(body)) failures.push(`${key}: expected a list for ${type}`)
    if (sample === undefined) continue // an empty list is a valid recording
    checked++
    for (const k of requiredKeys(type)) if (!(sample && typeof sample === 'object' && k in sample)) failures.push(`${key}: ${type} lacks "${k}"`)
    if (/NaN|Infinity/.test(JSON.stringify(body))) failures.push(`${key}: contains NaN or Infinity`)
  }
  console.log(`fixtures-check: ${Object.keys(index.keys ?? {}).length} keys, ${checked} bodies validated`)

  let bytes = 0
  let gz = 0
  for (const f of fa) {
    const buf = readFileSync(join(a, f))
    bytes += statSync(join(a, f)).size
    gz += gzipSync(buf).length
  }
  console.log(`fixtures-check: ${(bytes / 1048576).toFixed(1)} MB on disk, ${(gz / 1048576).toFixed(1)} MB gzip`)
  if (bytes > 25 * 1048576) failures.push('fixtures exceed 25 MB on disk')
  if (gz > 4 * 1048576) failures.push('fixtures exceed 4 MB gzip')
} catch (e) {
  failures.push(String(e.message ?? e))
} finally {
  rmSync(a, { recursive: true, force: true })
  rmSync(b, { recursive: true, force: true })
}

if (failures.length) {
  console.error('\nfixtures-check failed:\n - ' + failures.slice(0, 40).join('\n - '))
  process.exit(1)
}
console.log('fixtures-check: ok')
