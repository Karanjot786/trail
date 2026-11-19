// Builds t.ts -> ../internal/ingest/t.js (embedded by Go). Fails if core > 2048 bytes gzipped.
// Tries the build with vitals + rage clicks (runtime-gated by data-vitals / data-rage) first;
// if that does not fit the budget, ships the core as t.js and the full one as dist/t.full.js.
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const LIMIT = 2048;
const root = new URL('.', import.meta.url);
const out = new URL('../internal/ingest/t.js', import.meta.url);
const fullOut = new URL('dist/t.full.js', root);

const compile = async (full) =>
  (
    await build({
      entryPoints: [new URL('t.ts', root).pathname],
      bundle: false,
      minify: true,
      target: 'es2020',
      format: 'iife',
      write: false,
      legalComments: 'none',
      define: { FULL: String(full) },
    })
  ).outputFiles[0].contents;

const gz = (b) => gzipSync(b, { level: 9 }).length;

const full = await compile(true);
const core = await compile(false);
mkdirSync(new URL('dist/', root), { recursive: true });

let shipped;
if (gz(full) <= LIMIT) {
  shipped = full;
  rmSync(fullOut, { force: true });
  console.log('vitals + rage clicks fit in the core budget (gated at runtime by data-vitals / data-rage)');
} else {
  shipped = core;
  writeFileSync(fullOut, full);
  console.log(`t.full.js ${full.length} bytes raw, ${gz(full)} bytes gz (vitals + rage; separate file, dist/t.full.js)`);
}
writeFileSync(out, shipped);
const size = gz(shipped);
console.log(`t.js ${shipped.length} bytes raw, ${size} bytes gz (limit ${LIMIT})`);
if (size > LIMIT) {
  console.error(`FAIL: t.js is ${size} bytes gzipped, over the ${LIMIT} byte budget`);
  process.exit(1);
}
