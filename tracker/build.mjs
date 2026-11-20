// Builds the tracker into ../internal/ingest/ (embedded by Go):
//   t.ts -> t.js (core)   x.ts -> t.x.js (opt-in vitals + rage clicks)
// Fails if any file is over 2048 bytes gzipped.
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const LIMIT = 2048;
let fail = 0;
for (const [src, out] of [['t.ts', 't.js'], ['x.ts', 't.x.js']]) {
  const [f] = (
    await build({
      entryPoints: [new URL(src, import.meta.url).pathname],
      minify: true,
      target: 'es2020',
      format: 'iife',
      write: false,
      legalComments: 'none',
    })
  ).outputFiles;
  writeFileSync(new URL('../internal/ingest/' + out, import.meta.url), f.contents);
  const gz = gzipSync(f.contents, { level: 9 }).length;
  console.log(`${out} ${f.contents.length} bytes raw, ${gz} bytes gz (limit ${LIMIT})`);
  if (gz > LIMIT) fail = console.error(`FAIL: ${out} is over the ${LIMIT} byte budget`) || 1;
}
process.exit(fail);
