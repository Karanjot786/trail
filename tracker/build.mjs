// Builds the tracker into ../internal/ingest/ (embedded by Go):
//   t.ts -> t.js (MODE full: private until consent, or data-mode)
//   t.ts -> t.p.js (MODE private: no storage code)   x.ts -> t.x.js (opt-in vitals + rage clicks)
// Fails if any file is over 2048 bytes gzipped.
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const LIMIT = 2048;
let fail = 0;
for (const [src, out, MODE] of [['t.ts', 't.js', 'full'], ['t.ts', 't.p.js', 'private'], ['x.ts', 't.x.js']]) {
  const [f] = (
    await build({
      entryPoints: [new URL(src, import.meta.url).pathname],
      minify: true,
      target: 'es2020',
      write: false,
      legalComments: 'none',
      define: { MODE: JSON.stringify(MODE ?? '') },
    })
  ).outputFiles;
  writeFileSync(new URL('../internal/ingest/' + out, import.meta.url), f.contents);
  const gz = gzipSync(f.contents, { level: 9 }).length;
  console.log(`${out} ${f.contents.length} bytes raw, ${gz} bytes gz (limit ${LIMIT})`);
  if (gz > LIMIT) fail = console.error(`FAIL: ${out} is over the ${LIMIT} byte budget`) || 1;
}
process.exit(fail);
