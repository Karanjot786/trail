// Bundle budget (plan T-4). Reads dist/.vite/manifest.json and gzips each chunk.
// Fails when the entry plus its static imports exceed 170 KB gzip, any lazy chunk exceeds 60 KB gzip, or the
// entry chunks contain getCoreRowModel (react-table), recharts or react-aria. Run after `pnpm build`.
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const manifestPath = join(dist, '.vite', 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error('budget: dist/.vite/manifest.json is missing. Run `pnpm build` first.')
  process.exit(2)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const ENTRY_MAX = 170 * 1024
const LAZY_MAX = 60 * 1024
const FORBIDDEN_IN_ENTRY = ['getCoreRowModel', 'recharts', 'react-aria']

const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length
const text = (file) => readFileSync(join(dist, file), 'utf8')

const entry = Object.values(manifest).find((c) => c.isEntry)
if (!entry) {
  console.error('budget: no entry chunk in the manifest')
  process.exit(2)
}
const entryFiles = new Set()
const walk = (key) => {
  const c = manifest[key]
  if (!c || entryFiles.has(c.file)) return
  entryFiles.add(c.file)
  for (const i of c.imports ?? []) walk(i)
}
walk(Object.keys(manifest).find((k) => manifest[k] === entry))

const rows = []
const failures = []
let entryTotal = 0
for (const f of entryFiles) {
  const size = gz(f)
  entryTotal += size
  rows.push({ chunk: f, kind: 'entry', gzipKB: +(size / 1024).toFixed(1), limitKB: '' })
  const src = text(f)
  for (const word of FORBIDDEN_IN_ENTRY) if (src.includes(word)) failures.push(`${f} (initial JS) contains "${word}"`)
}
rows.push({ chunk: 'initial JS total', kind: 'entry', gzipKB: +(entryTotal / 1024).toFixed(1), limitKB: 170 })
if (entryTotal > ENTRY_MAX) failures.push(`initial JS is ${(entryTotal / 1024).toFixed(1)} KB gzip, limit 170 KB`)

for (const c of Object.values(manifest)) {
  if (!c.file.endsWith('.js') || entryFiles.has(c.file)) continue
  const size = gz(c.file)
  rows.push({ chunk: c.file, kind: c.isDynamicEntry ? 'lazy' : 'shared', gzipKB: +(size / 1024).toFixed(1), limitKB: 60 })
  if (size > LAZY_MAX) failures.push(`${c.file} is ${(size / 1024).toFixed(1)} KB gzip, lazy limit 60 KB`)
}

console.table(rows)
if (failures.length) {
  console.error('\nBudget failures:\n - ' + failures.join('\n - '))
  process.exit(1)
}
console.log('\nbudget: ok')
